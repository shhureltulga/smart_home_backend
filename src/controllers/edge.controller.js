import { PrismaClient } from '@prisma/client';
import { verifyHmacHeader } from '../lib/hmac.js';
import { sendCommand } from '../services/edgeClient.js';

const prisma = new PrismaClient();

/**
 * Edge → Main: батчаар ирэх мэдрэгчийн уншилтууд
 * body: { readings: [{ deviceKey, type, value, ts? }], edgeId? }
 * Header: X-EDGE-SIGN (HMAC)
 */
export async function ingestFromEdge(req, res) {
  try {
    const siteId = req.params.siteId;
    const { readings = [], edgeId } = req.body ?? {};

    // HMAC баталгаажуулалт (хамгийн энгийн хувилбар)
    if (!verifyHmacHeader(req)) {
      return res.status(401).json({ ok: false, error: 'invalid_signature' });
    }

    // Site/Household шалгах
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { household: true }
    });
    if (!site) return res.status(404).json({ ok: false, error: 'site_not_found' });

    const householdId = site.householdId;

    // DB-д бичих
    const now = new Date();
    const createData = readings.map(r => ({
      householdId,
      deviceKey: String(r.deviceKey),
      type: r.type ?? null,
      value: Number(r.value),
      ts: r.ts ? new Date(r.ts) : now,
    }));

    if (createData.length) {
      await prisma.sensorReading.createMany({ data: createData });

      // latestSensors-г upsert (сүүлийн утга)
      await Promise.all(createData.map((r) =>
        prisma.latestSensor.upsert({
          where: { householdId_deviceKey: { householdId, deviceKey: r.deviceKey } },
          update: { value: r.value, type: r.type, ts: r.ts, updatedAt: new Date() },
          create: { householdId, deviceKey: r.deviceKey, type: r.type, value: r.value, ts: r.ts }
        })
      ));
    }

    // Edge lastSeen
    if (edgeId) {
      await prisma.edgeNode.updateMany({
        where: { siteId, id: edgeId },
        data: { lastSeenAt: new Date(), status: 'online' }
      });
    }

    return res.json({ ok: true, count: createData.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'server_error', detail: String(e) });
  }
}

/**
 * Main → Edge: тушаал дамжуулах жишээ
 * body: { cmd: 'reboot' | 'relay_on' | ..., args?: any }
 */
export async function sendCommandToEdge(req, res) {
  try {
    const siteId = req.params.siteId;
    const { cmd, args } = req.body ?? {};
    if (!cmd) return res.status(400).json({ ok: false, error: 'cmd_required' });

    // site + edge олох
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { edge: true, household: true }
    });
    if (!site?.edge) return res.status(404).json({ ok: false, error: 'edge_not_found' });

    // DB-д команд хадгалах (queue)
    const edgeCmd = await prisma.edgeCommand.create({
      data: {
        edgeId: site.edge.id,
        payload: { cmd, args },
        status: 'queued'
      }
    });

    // Edge рүү REST дуудлага (async)
    const result = await sendCommand(site.edge, edgeCmd);

    // амжилттай бол статус шинэчилнэ
    await prisma.edgeCommand.update({
      where: { id: edgeCmd.id },
      data: {
        status: 'sent',
        sentAt: new Date()
      }
    });

    return res.json({ ok: true, result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'server_error', detail: String(e) });
  }
}

/** Edge ping (сонголт) */
export async function edgePing(req, res) {
  try {
    const siteId = req.params.siteId;
    const { edgeId } = req.body ?? {};

    const site = await prisma.site.findUnique({ where: { id: siteId }, include: { edge: true } });
    if (!site?.edge) return res.status(404).json({ ok: false, error: 'edge_not_found' });

    await prisma.edgeNode.update({
      where: { id: site.edge.id },
      data: { lastSeenAt: new Date(), status: 'online' }
    });

    return res.json({ ok: true, edgeId: edgeId ?? site.edge.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'server_error', detail: String(e) });
  }
}
