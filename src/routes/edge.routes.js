// routes/edge.routes.js
import { Router } from 'express';
import crypto from 'crypto';

const r = Router();

// --- Жижиг HMAC шалгалт (туршилтын) ---
function verifyHmac(req) {
  const secret = process.env.EDGE_SHARED_SECRET || 'change-this-very-strong';
  const ts = req.get('x-timestamp') || '';
  const edgeId = req.get('x-edge-id') || '';
  const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const base = ['POST', req.path, ts, payload].join('\n');
  const sig = crypto.createHmac('sha256', secret).update(base).digest('hex');
  return sig === (req.get('x-signature') || '');
}

// --- 1) Heartbeat (POST) ---
r.post('/edge/heartbeat', (req, res) => {
  if (!verifyHmac(req)) {
    return res.status(401).json({ ok: false, error: 'invalid_signature' });
  }
  const { edgeId, status } = {
    edgeId: req.get('x-edge-id') || 'unknown',
    status: req.body?.status === 'offline' ? 'offline' : 'online',
  };
  // TODO: DB-д edgeNode.lastSeenAt/status шинэчлэх
  return res.json({ ok: true, edgeId, status });
});

// --- 2) Ingest (POST) --- Edge-ээс уншилтууд ирүүлнэ
r.post('/edge/ingest', (req, res) => {
  if (!verifyHmac(req)) {
    return res.status(401).json({ ok: false, error: 'invalid_signature' });
  }
  const readings = Array.isArray(req.body?.readings) ? req.body.readings : [];
  // TODO: Prisma ашиглаад SensorReading/LatestSensor-д бичих
  return res.json({ ok: true, saved: readings.length });
});

// (сонголт) Команд авах/баталгаажуулах endpoint-уудыг дараа нь энд нэмж болно.

export default r;
