const express = require('express');
const crypto = require('crypto');

const router = express.Router();

/**
 * HMAC баталгаажуулалт (Edge ↔ Main)
 * Headers (Edge interceptor-оос автоматаар нэмэгдэнэ):
 *  - x-edge-id
 *  - x-timestamp         (Edge: Date.now() millis)
 *  - x-signature         (Hex HMAC-SHA256)
 *
 * Sign base формат (Edge-тэй ИЖИЛ):
 *   method|path|timestamp|SHA256(bodyJsonString)
 *
 * Жич:
 * - path нь router-ийн харьцангуй path (жишээ: /edge/heartbeat)
 * - body нь JSON string (хэрвээ хоосон бол "{}")
 */
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

    const signBase = `${method}|${path}|${ts}|${bodyHash}`;
    const expected = crypto.createHmac('sha256', secret).update(signBase).digest('hex');

    if (expected !== sig) {
      return res.status(401).json({ ok: false, error: 'invalid_signature' });
    }

    // OK
    return next();
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'hmac_error', detail: String(err && err.message || err) });
  }
}

/**
 * POST /edge/heartbeat
 * Body: { householdId, edgeId, status }
 * TODO: Prisma.update EdgeNode { status, lastSeenAt: new Date() } by edgeId/householdId
 */
router.post('/edge/heartbeat', verifyHmac, async (req, res) => {
  try {
    const { householdId, edgeId, status } = req.body || {};
    // TODO: await prisma.edgeNode.update({ where: { id: edgeId }, data: { status, lastSeenAt: new Date() } });

    return res.json({ ok: true, edgeId, householdId: householdId || null, status: status || 'online' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'heartbeat_failed', detail: String(err && err.message || err) });
  }
});

/**
 * POST /edge/ingest
 * Body: { householdId, edgeId, readings: [{ deviceKey, type, value, ts? }, ...] }
 * TODO: Prisma.createMany SensorReading; upsert LatestSensor
 */
router.post('/edge/ingest', verifyHmac, async (req, res) => {
  try {
    const { householdId, edgeId, readings } = req.body || {};
    const count = Array.isArray(readings) ? readings.length : 0;

    // TODO:
    //   await prisma.sensorReading.createMany({...})
    //   for each reading → upsert LatestSensor by (siteId/deviceKey) or (householdId/edgeId/deviceKey)

    return res.json({ ok: true, saved: count, edgeId, householdId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'ingest_failed', detail: String(err && err.message || err) });
  }
});

/**
 * GET /edge/commands
 * Query (optional): householdId, edgeId, since
 * Response: { ok: true, commands: [{ id, payload, ... }] }
 * TODO: queued командуудыг DB-с уншиж буцаах; мөн 'sent' болгож тэмдэглэх
 */
router.get('/edge/commands', verifyHmac, async (req, res) => {
  try {
    // const edgeId = req.get('x-edge-id');
    // const since = req.query.since;
    // TODO: const cmds = await prisma.edgeCommand.findMany({ where: { edgeId, status: 'queued' } });
    const commands = []; // түр хоосон

    return res.json({ ok: true, commands });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'commands_fetch_failed', detail: String(err && err.message || err) });
  }
});

/**
 * POST /edge/commands/ack
 * Body: { commandId, status: 'acked' | 'failed', error? }
 * TODO: EdgeCommand(id=commandId)-ийн статус update (acked/failed), ackedAt
 */
router.post('/edge/commands/ack', verifyHmac, async (req, res) => {
  try {
    const { commandId, status, error } = req.body || {};
    // TODO: await prisma.edgeCommand.update({ where: { id: commandId }, data: { status, error: error || null, ackedAt: new Date() } });

    return res.json({ ok: true, commandId, status, error: error || null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'commands_ack_failed', detail: String(err && err.message || err) });
  }
});

module.exports = router;
