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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

async function ensureDirs() {
  await fs.mkdir(PBD_ROOT,  { recursive: true });
  await fs.mkdir(META_ROOT, { recursive: true });
}

function sanitizeSegment(s) {
  return String(s || '').trim().replace(/[^\w\-.]/g, '');
}

// ───────────────────────────────────────────────────────────
// POST /api/pbd/upload
// FormData: siteId (req), floorId (req), version? (opt), file=pbd.json (req)
r.post('/upload', upload.single('file'), async (req, res) => {
  try {
    await ensureDirs();

    const siteIdRaw  = req.body.siteId;
    const floorIdRaw = req.body.floorId;
    const versionRaw = req.body.version;

    const siteId  = sanitizeSegment(siteIdRaw);
    const floorId = sanitizeSegment(floorIdRaw);
    const version = sanitizeSegment(versionRaw);

    if (!siteId || !floorId || !req.file) {
      return res.status(400).json({ ok:false, error:'siteId, floorId болон file шаардлагатай' });
    }

    // ===== JSON parse + basic validation =====
    const buf  = req.file.buffer;
    const text = buf.toString('utf-8');

    let pbd;
    try {
      pbd = JSON.parse(text);
    } catch {
      return res.status(400).json({ ok:false, error:'Зөв JSON файл оруул' });
    }

    // Хүсвэл PBD доторх floorId-тайгаа тааруулж шалгана (сонголттой, зөвлөе)
    if (pbd.floorId && sanitizeSegment(pbd.floorId) !== floorId) {
      return res.status(400).json({ ok:false, error:'PBD JSON дахь floorId илгээгдсэн floorId-тэй таарах ёстой' });
    }
    if (!Array.isArray(pbd.rooms)) {
      return res.status(400).json({ ok:false, error:'PBD JSON-д rooms массив байх ёстой' });
    }

    // ===== version derive from hash if not set =====
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const v    = (version || `h_${hash.slice(0,12)}`);

    // ===== write JSON to /pbd/<siteId>/<floorId>/<version>.json =====
    const floorDir = path.join(PBD_ROOT, siteId, floorId);
    await fs.mkdir(floorDir, { recursive: true });

    const relKey  = path.join('pbd', siteId, floorId, `${v}.json`);
    const absPath = path.join(CDN_ROOT, relKey);
    await fs.writeFile(absPath, text, 'utf-8');

    // ===== write latest meta to /meta/<siteId>.<floorId>.latest.json =====
    const latestMeta = {
      siteId,
      floorId,
      version: v,
      hash,
      url: `/cdn/${relKey}`,
      updatedAt: new Date().toISOString(),
    };

    const latestMetaPath = path.join(META_ROOT, `${siteId}.${floorId}.latest.json`);
    await fs.writeFile(latestMetaPath, JSON.stringify(latestMeta, null, 2), 'utf-8');

    return res.json({ ok:true, ...latestMeta });
  } catch (e) {
    console.error('[PBD upload]', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ───────────────────────────────────────────────────────────
// GET /api/pbd/latest?siteId=...&floorId=...
// Давхар тус бүрийн "latest" мета-г буцаана.
r.get('/latest', async (req, res) => {
  try {
    const siteId  = sanitizeSegment(req.query.siteId);
    const floorId = sanitizeSegment(req.query.floorId);
    if (!siteId || !floorId) {
      return res.status(400).json({ ok:false, error:'siteId болон floorId шаардлагатай' });
    }

    const metaPath = path.join(META_ROOT, `${siteId}.${floorId}.latest.json`);
    const metaTxt  = await fs.readFile(metaPath, 'utf-8');
    const meta     = JSON.parse(metaTxt);

    return res.json({ ok:true, ...meta });
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).json({ ok:false, error:'Тухайн давхарын PBD latest олдсонгүй' });
    }
    console.error('[PBD latest]', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
});

export default r;
