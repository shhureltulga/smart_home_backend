// server/routes/devQueue.js
import express from 'express';

export const devQueue = express.Router();

/**
 * POST /api/dev/sites/:siteId/queue
 * Body:
 * {
 *   "type": "light.set" | "ha.area.ensure",
 *   "payload": {
 *     // light.set
 *     "deviceKey": "living.light",
 *     "on": true,
 *     "brightness": 80,
 *     // ha.area.ensure
 *     "room": { "id": "LR", "name": "Living" }
 *   }
 * }
 */
devQueue.post('/sites/:siteId/queue', express.json(), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { siteId } = req.params;
    const { type = 'light.set', payload = {} } = req.body || {};

    // Site + Edge шалгах (edgeId авахын тулд)
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, householdId: true, edge: { select: { id: true } } },
    });
    if (!site) return res.status(404).json({ ok: false, error: 'site_not_found' });
    if (!site.edge) return res.status(400).json({ ok: false, error: 'edge_not_attached_to_site' });

    // Edge-д очих payload-оо нэгтгэж хадгална
    const fullPayload = {
      type,
      siteId: site.id,
      householdId: site.householdId,
      ...payload, // deviceKey/on/brightness/room гэх мэт
    };

    // Main DB queue-д INSERT
    const cmd = await prisma.edgeCommand.create({
      data: {
        edgeId: site.edge.id,
        payload: fullPayload,
        status: 'queued', // enum CommandStatus
      },
      select: { id: true, edgeId: true, status: true, createdAt: true },
    });

    res.json({ ok: true, queued: cmd, payload: fullPayload });
  } catch (e) {
    console.error('[DEV QUEUE] error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * (сонголттой) edgeId-гаар шууд enqueue
 * POST /api/dev/edges/:edgeId/queue
 */
devQueue.post('/edges/:edgeId/queue', express.json(), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const { edgeId } = req.params;
    const { type = 'light.set', payload = {} } = req.body || {};

    const edge = await prisma.edgeNode.findUnique({
      where: { id: edgeId },
      select: { id: true },
    });
    if (!edge) return res.status(404).json({ ok: false, error: 'edge_not_found' });

    const cmd = await prisma.edgeCommand.create({
      data: { edgeId: edge.id, payload: { type, ...payload }, status: 'queued' },
      select: { id: true, edgeId: true, status: true, createdAt: true },
    });

    res.json({ ok: true, queued: cmd });
  } catch (e) {
    console.error('[DEV QUEUE by edgeId] error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
