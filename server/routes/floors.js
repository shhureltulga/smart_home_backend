// server/routes/floors.js
import express, { Router } from 'express';     // ✅ express-г өөрийг нь оруулна
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { hmacGuard } from '../../src/lib/hmac.js';

const r = Router();

/* ===== JWT auth ===== */
function auth(req, res, next) {
  try {
    const h = req.get('authorization') || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
    const token = h.slice(7);
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

/* ===== Either JWT or HMAC =====
   x-signature байвал HMAC, үгүй бол Bearer JWT шалгана. */
function eitherAuthOrHmac(req, res, next) {
  if (req.get('x-signature')) return hmacGuard(req, res, next);
  const h = req.get('authorization') || '';
  if (h.startsWith('Bearer ')) return auth(req, res, next);
  return res.status(401).json({ error: 'unauthorized' });
}

/* ===== util ===== */
function normalizeEmptyToNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/* ===== enqueue helper ===== */
async function enqueueForSite(prisma, siteId, householdId, payload) {
  const edges = await prisma.edgeNode.findMany({
    where: { siteId, householdId },
    select: { id: true },
    orderBy: { lastSeenAt: 'desc' },
  });
  if (!edges.length) return 0;

  await prisma.edgeCommand.createMany({
    data: edges.map(e => ({ edgeId: e.id, status: 'queued', payload })),
  });
  return edges.length;
}
// floors.js дотор, POST-ийн дээр/доор хаана ч болно
r.get('/floors', auth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const siteId = (req.query.siteId || '').trim();
  if (!siteId) return res.status(400).json({ error: 'siteId_required' });

  const floors = await prisma.floor.findMany({
    where: { siteId },
    select: { id: true, name: true, code: true, level: true, order: true, haFloorId: true },
    orderBy: [{ order: 'asc' }, { level: 'asc' }, { name: 'asc' }],
  });

  return res.json({ ok: true, items: floors });
});

r.get('/site/:siteId/floors', auth, async (req, res) => {
  req.query.siteId = req.params.siteId; // reuse
  return r.handle(req, res); // эсвэл дээрх логикийг шууд давт
});

/* ===== POST /api/floors ===== */
r.post('/floors', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const { householdId, siteId, name, code, level, order } = req.body || {};
    if (!householdId || !siteId || !name?.toString().trim()) {
      return res.status(400).json({ error: 'bad_request' });
    }

    const member = await prisma.householdMember.findFirst({
      where: { householdId, userId: req.user.sub, status: 'active' },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    const site = await prisma.site.findFirst({ where: { id: siteId, householdId }, select: { id: true } });
    if (!site) return res.status(404).json({ error: 'site_not_found' });

    const floor = await prisma.floor.create({
      data: {
        name: String(name).trim(),
        code: code ? String(code) : null,
        level: typeof level === 'number' ? level : null,
        order: typeof order === 'number' ? order : 0,
        siteId, householdId,
      },
      select: { id: true, name: true, siteId: true, haFloorId: true, householdId: true },
    });

    await enqueueForSite(prisma, siteId, householdId, {
      id: floor.id,
      type: 'ha.floor.ensure',
      deviceKey: `floor_${floor.id}`,
      floor: { id: floor.id, name: floor.name },
      haFloorId: floor.haFloorId ?? null,
      event: 'floor.created',
      siteId, householdId,
      ts: new Date().toISOString(),
    });

    return res.json({ ok: true, floor });
  } catch (e) {
    console.error('[POST /api/floors] error:', e);
    if (e?.code === 'P2002') return res.status(409).json({ error: 'floor_name_conflict' });
    return res.status(500).json({ error: 'server_error' });
  }
});

/* ===== PATCH /api/floors/:id/ha =====
   ⚠️ PER-ROUTE body parser-ийг guard-аас өмнө зарлана. */
r.patch(
  '/floors/:id/ha',
  express.json(),           // ✅ энд заавал
  eitherAuthOrHmac,         // ✅ дараа нь guard
  async (req, res) => {
    try {
      const prisma = req.app.locals.prisma;
      const id = (req.params.id || '').toString().trim();
      if (!id) return res.status(400).json({ error: 'floor_id_required' });

      const { haFloorId } = req.body || {};
      const newHa = normalizeEmptyToNull(haFloorId);

      const floor = await prisma.floor.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!floor) return res.status(404).json({ error: 'floor_not_found' });

      const updated = await prisma.floor.update({
        where: { id: floor.id },
        data: { haFloorId: newHa },
        select: { id: true, haFloorId: true },
      });

      return res.json({ ok: true, id: updated.id, haFloorId: updated.haFloorId });
    } catch (e) {
      console.error('[PATCH /api/floors/:id/ha] error:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  }
);

export default r;
