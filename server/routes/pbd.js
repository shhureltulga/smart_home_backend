// server/routes/pbd.js
import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const r = Router();

const CDN_ROOT  = process.env.CDN_ROOT  || '/var/app/cdn';
const PBD_ROOT  = path.join(CDN_ROOT, 'pbd');
const META_ROOT = path.join(CDN_ROOT, 'meta');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

async function ensureDirs() {
  await fs.mkdir(PBD_ROOT,  { recursive: true });
  await fs.mkdir(META_ROOT, { recursive: true });
}

// POST /api/pbd/upload   (FormData: siteId, version?, file=pbd.json)
r.post('/upload', upload.single('file'), async (req, res) => {
  try {
    await ensureDirs();
    const siteId  = (req.body.siteId || '').trim();
    const version = (req.body.version || '').trim();
    if (!siteId || !req.file) {
      return res.status(400).json({ ok:false, error:'siteId болон file шаардлагатай' });
    }

    // JSON эсэхийг шалгах
    const buf  = req.file.buffer;
    const text = buf.toString('utf-8');
    try { JSON.parse(text); } catch {
      return res.status(400).json({ ok:false, error:'Зөв JSON файл оруул' });
    }

    // hash + version
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const v    = (version || `h_${hash.slice(0,12)}`).replace(/[^\w\-.]/g,'');

    // /var/app/cdn/pbd/<siteId>/<version>.json
    const siteDir = path.join(PBD_ROOT, siteId);
    await fs.mkdir(siteDir, { recursive: true });
    const relKey  = path.join('pbd', siteId, `${v}.json`);
    const absPath = path.join(CDN_ROOT, relKey);
    await fs.writeFile(absPath, text, 'utf-8');

    // latest мета: /var/app/cdn/meta/<siteId>.latest.json
    const latestMeta = {
      siteId,
      version: v,
      hash,
      url: `/cdn/${relKey}`,
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(
      path.join(META_ROOT, `${siteId}.latest.json`),
      JSON.stringify(latestMeta, null, 2),
      'utf-8'
    );

    return res.json({ ok:true, ...latestMeta });
  } catch (e) {
    console.error('[PBD upload]', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
});

export default r;
