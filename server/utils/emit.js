// server/utils/emit.js
import crypto from 'node:crypto';

const EDGEHOOK_URL = process.env.EDGEHOOK_URL || 'http://localhost:4000/edgehooks';
const EDGE_ID = process.env.EDGE_ID || 'edge_nas_01';
const EDGE_SHARED_SECRET = process.env.EDGE_SHARED_SECRET || 'change-this-very-strong';

/**
 * HMAC гарын үсэг үүсгэнэ (verifyHmac middleware-тэй таарна)
 * base = METHOD | PATH | TIMESTAMP | sha256(body)
 * sig  = HMAC_SHA256(base, EDGE_SHARED_SECRET)
 */
function signHmac({ method, path, bodyStr, ts }) {
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const base = `${method.toUpperCase()}|${path}|${ts}|${bodyHash}`;
  const sig = crypto.createHmac('sha256', EDGE_SHARED_SECRET).update(base).digest('hex');
  return { sig, bodyHash };
}

/**
 * Edge-д fire-and-forget эвент илгээнэ.
 * verifyHmac-тэй route-ууд дээр шууд ажиллана.
 *
 * @param {string} path - ж: '/rooms', '/edge/ingest' гэх мэт (эхэндээ / байх нь зүйтэй)
 * @param {object} payload - илгээх JSON ачаа
 * @param {number} timeoutMs - тасалдуулах хугацаа (default: 1500ms)
 */
export async function emitEdge(path, payload = {}, timeoutMs = 1500) {
  try {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const url = `${EDGEHOOK_URL}${safePath}`;

    const bodyStr = JSON.stringify(payload || {});
    const ts = Date.now().toString();

    const { sig } = signHmac({ method: 'POST', path: safePath, bodyStr, ts });

    // Fire-and-forget: богино timeout тавина (backend гацахгүй)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-edge-id': EDGE_ID,
        'x-timestamp': ts,
        'x-signature': sig,
      },
      body: bodyStr,
      signal: controller.signal,
    }).catch(() => {
      // Edge тасарсан үед чимээгүй алгасах (Intentional)
    });

    clearTimeout(timer);
  } catch (e) {
    console.warn('[emitEdge] failed:', e?.message || e);
  }
}

export default { emitEdge };
