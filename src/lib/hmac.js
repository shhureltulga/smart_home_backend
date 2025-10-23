// src/lib/hmac.js
import crypto from 'crypto';

export function verifyHmacHeader(req) {
  const secret    = process.env.EDGE_SHARED_SECRET || 'change-me';
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];

  const method = (req.method || 'GET').toUpperCase();
  const path   = (req.originalUrl || req.url || '').split('?')[0];

  const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const bodySha = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const base    = `${method}|${path}|${timestamp}|${bodySha}`;
  const expected= crypto.createHmac('sha256', secret).update(base).digest('hex');

  // 🔎 DEBUG
  console.log('[HMAC] method=', method);
  console.log('[HMAC] path  =', path);
  console.log('[HMAC] ts    =', timestamp);
  console.log('[HMAC] bodySha=', bodySha);
  console.log('[HMAC] expected=', expected);
  console.log('[HMAC] received=', signature);

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function hmacGuard(req, res, next) {
  try {
    const secret = process.env.EDGE_SHARED_SECRET || 'change-this-very-strong';

    const sigHeader = req.headers['x-signature'];
    const tsHeader  = req.headers['x-timestamp'];
    // edge_id-г одоохондоо лог/диагностикт ашиглая
    const edgeId    = req.headers['x-edge-id'] || 'unknown-edge';

    if (!sigHeader || !tsHeader) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // exact path: /api/devices/register гэх мэт (query-гүй)
    // Express-д req.originalUrl нь query-той байж болох тул pathname ялгана.
    const url = new URL(req.protocol + '://' + req.get('host') + req.originalUrl);
    const method = req.method.toUpperCase();
    const path = url.pathname;

    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const bodySha = crypto.createHash('sha256').update(bodyStr).digest('hex');
    const base = `${method}|${path}|${tsHeader}|${bodySha}`;
    const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');

    const ok = timingSafeEqualHex(sigHeader.toString(), expected);
    if (!ok) {
      console.warn('[HMAC] invalid signature', { edgeId, path, method });
      return res.status(401).json({ error: 'unauthorized' });
    }

    // (сонголт) timestamp drift шалгахыг хүсвэл энд 5 мин гэх мэтээр шалгана.
    // const drift = Math.abs(Date.now() - Number(tsHeader));
    // if (drift > 5*60*1000) return res.status(401).json({ error: 'clock_skew' });

    return next();
  } catch (e) {
    console.error('[HMAC] verify error:', e);
    return res.status(401).json({ error: 'unauthorized' });
  }
}

// Хоёр hex string-ийг тайминг-д аюулгүйгээр харьцуулах туслах функц
function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
