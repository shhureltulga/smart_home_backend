import crypto from 'crypto';

export function verifyHmacHeader(req) {
  const secret = process.env.EDGE_SHARED_SECRET || 'change-me';
  const sig = req.headers['x-edge-sign'];
  if (!sig) return false;

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
