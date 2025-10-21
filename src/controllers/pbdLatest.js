// server/controllers/pbdLatest.js
import fs from 'fs/promises';
import path from 'path';

const CDN_ROOT  = process.env.CDN_ROOT  || '/var/app/cdn';
const META_ROOT = process.env.META_ROOT || path.join(CDN_ROOT, 'meta');

// GET /api/site/:siteId/pbd/latest
export async function getLatestForSite(req, res) {
  try {
    const siteId = (req.params.siteId || '').trim();
    if (!siteId) return res.status(400).json({ ok:false, error:'siteId алга' });

    // TODO: JWT-аас тухайн хэрэглэгч энэ site-д нэвтрэх эрхтэй эсэхийг шалгах (household/site mapping)

    const metaPath = path.join(META_ROOT, `${siteId}.latest.json`);
    const txt = await fs.readFile(metaPath, 'utf-8').catch(() => null);
    if (!txt) return res.status(404).json({ ok:false, error:'Энэ site-д PBD хараахан байрлуулаагүй' });

    const latest = JSON.parse(txt);
    return res.json(latest); // { siteId, version, hash, url, updatedAt }
  } catch (e) {
    console.error('[PBD latest]', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
}
