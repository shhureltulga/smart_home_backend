// src/routes/edge.routes.js
import { Router } from 'express';
import crypto from 'crypto';

const r = Router();

/** HMAC verify (prefix sign-д орохгүй) */
function verifyHmac(req, res, next) {
  try {
    const secret = process.env.EDGE_SHARED_SECRET || 'change-this-very-strong';
    const edgeId = req.get('x-edge-id') || '';
    const ts = req.get('x-timestamp') || '';
    const sig = req.get('x-signature') || '';
    if (!edgeId || !ts || !sig) {
      return res.status(401).json({ ok: false, error: 'missing_hmac_headers' });
    }

    const method = req.method.toUpperCase();
    const path = req.path; // /edge/heartbeat, /edge/ingest, ...
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    const base = `${method}|${path}|${ts}|${bodyHash}`;
    const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
    if (expected !== sig) {
      return res.status(401).json({ ok: false, error: 'invalid_signature' });
    }
    return next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'hmac_error' });
  }
}

/** ---------- 1) Heartbeat ---------- */
r.post('/edge/heartbeat', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;

    const status = req.body?.status === 'offline' ? 'offline' : 'online';
    const edgeIdHeader = req.get('x-edge-id') || '';
    const edgeId = req.body?.edgeId || edgeIdHeader || 'unknown';

    const householdId = req.body?.householdId || '';
    const siteId      = req.body?.siteId || '';

    if (!householdId) return res.status(400).json({ ok: false, error: 'householdId_required' });
    if (!siteId)      return res.status(400).json({ ok: false, error: 'siteId_required' });

    // Site-г заавал олдоно, мөн тухайн household-д харьяалагдах ёстой
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site || site.householdId !== householdId) {
      return res.status(404).json({ ok: false, error: 'site_not_found_or_mismatch' });
    }

    // EdgeNode-г edgeId-аар upsert (schema: householdId, siteId заавал)
    await prisma.edgeNode.upsert({
      where: { edgeId },
      update: {
        householdId,
        siteId,
        status,
        lastSeenAt: new Date(),
      },
      create: {
        edgeId,
        householdId,
        siteId,
        status,
        lastSeenAt: new Date(),
      },
    });

    console.log(`[EDGEHOOKS] heartbeat edge=${edgeId} household=${householdId} site=${siteId} status=${status}`);
    return res.json({ ok: true, edgeId, status });
  } catch (e) {
    console.error('[EDGEHOOKS] heartbeat failed:', e);
    return res.status(500).json({ ok: false, error: 'heartbeat_failed', detail: String(e?.message || e) });
  }
});

/** ---------- 2) Ingest ---------- */
r.post('/edge/ingest', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;

    const edgeIdHeader = req.get('x-edge-id') || '';
    const edgeExtId = req.body?.edgeId || edgeIdHeader || 'unknown';
    const householdId = req.body?.householdId || '';
    const siteId      = req.body?.siteId || '';
    const readings    = Array.isArray(req.body?.readings) ? req.body.readings : [];

    if (!householdId) return res.status(400).json({ ok: false, error: 'householdId_required' });
    if (!siteId)      return res.status(400).json({ ok: false, error: 'siteId_required' });
    if (readings.length === 0) {
      return res.json({ ok: true, saved: 0 });
    }

    // Site-г баталгаажуулах
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site || site.householdId !== householdId) {
      return res.status(404).json({ ok: false, error: 'site_not_found_or_mismatch' });
    }

    // EdgeNode-г баталгаажуулах (байхгүй бол үүсгэнэ)
    let edge = await prisma.edgeNode.findUnique({ where: { edgeId: edgeExtId } });
    if (!edge) {
      edge = await prisma.edgeNode.create({
        data: {
          edgeId: edgeExtId,
          householdId,
          siteId,
          status: 'online',
          lastSeenAt: new Date(),
        },
      });
    } else if (edge.siteId !== siteId || edge.householdId !== householdId) {
      // мэдээлэл зөрсөн бол нэг мөр тааруулчихъя
      edge = await prisma.edgeNode.update({
        where: { edgeId: edgeExtId },
        data: { siteId, householdId },
      });
    }

    // 2.1 Түүх хадгалалт
    await prisma.sensorReading.createMany({
      data: readings.map((r) => ({
        householdId,
        siteId,
        edgeId: edge.id, // FK (EdgeNode.id)
        deviceKey: String(r.deviceKey || 'unknown'),
        type: r.type ? String(r.type) : 'custom',
        value: Number(r.value),
        ts: r.ts ? new Date(r.ts) : new Date(),
      })),
    });

    // 2.2 Latest upsert (siteId + deviceKey unique)
    for (const r0 of readings) {
      await prisma.latestSensor.upsert({
        where: {
          siteId_deviceKey: { siteId, deviceKey: String(r0.deviceKey || 'unknown') },
        },
        update: {
          type: r0.type ? String(r0.type) : 'custom',
          value: Number(r0.value),
          ts: r0.ts ? new Date(r0.ts) : new Date(),
        },
        create: {
          householdId,
          siteId,
          edgeId: edge.id,
          deviceKey: String(r0.deviceKey || 'unknown'),
          type: r0.type ? String(r0.type) : 'custom',
          value: Number(r0.value),
          ts: r0.ts ? new Date(r0.ts) : new Date(),
        },
      });
    }

    console.log(`[EDGEHOOKS] ingest edge=${edgeExtId} household=${householdId} site=${siteId} saved=${readings.length}`);
    return res.json({ ok: true, saved: readings.length });
  } catch (e) {
    console.error('[EDGEHOOKS] ingest failed:', e);
    return res.status(500).json({ ok: false, error: 'ingest_failed', detail: String(e?.message || e) });
  }
});

/** ---------- 3) Commands татах ---------- */
r.get('/edge/commands', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const edgeExtId = req.get('x-edge-id') || 'unknown';

    const edge = await prisma.edgeNode.findUnique({ where: { edgeId: edgeExtId } });
    if (!edge) return res.json({ ok: true, commands: [] });

    const cmds = await prisma.edgeCommand.findMany({
      where: { edgeId: edge.id, status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    if (cmds.length > 0) {
      await prisma.edgeCommand.updateMany({
        where: { id: { in: cmds.map((c) => c.id) } },
        data: { status: 'sent', sentAt: new Date() },
      });
    }

    return res.json({ ok: true, commands: cmds.map(c => ({ id: c.id, payload: c.payload })) });
  } catch (e) {
    console.error('[EDGEHOOKS] commands fetch failed:', e);
    return res.status(500).json({ ok: false, error: 'commands_fetch_failed', detail: String(e?.message || e) });
  }
});

/** ---------- 4) Commands ACK ---------- */
r.post('/edge/commands/ack', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const { commandId, status, error } = req.body || {};
    if (!commandId || !status) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    const updated = await prisma.edgeCommand.update({
      where: { id: commandId },
      data: {
        status: status === 'acked' ? 'acked' : 'failed',
        error: error || null,
        ackedAt: new Date(),
      },
      select: { id: true, status: true, error: true },
    });

    return res.json({ ok: true, ...updated });
  } catch (e) {
    console.error('[EDGEHOOKS] commands ack failed:', e);
    return res.status(500).json({ ok: false, error: 'commands_ack_failed', detail: String(e?.message || e) });
  }
});

export default r;
