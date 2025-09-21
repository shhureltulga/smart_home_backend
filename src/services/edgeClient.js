import axios from 'axios';
import crypto from 'crypto';

/**
 * site.edge мэдээлэл дээрээс baseUrl авна
 * Edge дээрх REST endpoint: POST {baseUrl}/api/ingest|/api/command ... гэж төсөөлсөн
 */
export async function sendCommand(edge, edgeCmd) {
  if (!edge?.baseUrl) throw new Error('edge baseUrl not set');

  const url = `${edge.baseUrl.replace(/\/+$/, '')}/api/command`;
  const payload = {
    id: edgeCmd.id,
    payload: edgeCmd.payload
  };

  const headers = signWithSharedSecret(payload);

  const resp = await axios.post(url, payload, { timeout: 10_000, headers });
  return resp.data;
}

/** Хамгийн энгийн HMAC (shared secret-ээр) */
export function signWithSharedSecret(body) {
  const secret = process.env.EDGE_SHARED_SECRET || 'change-me';
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  const sig = crypto.createHmac('sha256', secret).update(json).digest('hex');
  return { 'X-EDGE-SIGN': sig };
}
