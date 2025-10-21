import crypto from 'crypto';

/**
 * Edge-ээс ирж буй хүсэлтийг шалгах HMAC логик
 */
export function verifyHmacHeader(req) {
  const secret = process.env.EDGE_SHARED_SECRET || 'change-me';
  const sig = req.headers['x-signature']; // ⬅️ нэрийг нэгтгэв

  if (!sig) return false;

  const method = req.method;
  const path = req.originalUrl.split('?')[0]; // ⬅️ зөв path авах
  const timestamp = req.headers['x-timestamp'];

  const bodyStr = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body ?? {});

  const bodySha = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const base = `${method.toUpperCase()}|${path}|${timestamp}|${bodySha}`;
  const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

