// server/routes/rooms.js
import { Router } from 'express';
import jwt from 'jsonwebtoken';

const r = Router();

/* -------------------------- AUTH MIDDLEWARE -------------------------- */
function auth(req, res, next) {
  try {
    const h = req.get('authorization') || '';
    if (!h.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const token = h.slice(7);
    const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

/* -------------------------- QUEUE HELPER ----------------------------- */
/** Сайтад хамаарах бүх EdgeNode-д командыг queue-д оруулна. */
async function enqueueForSite(prisma, siteId, householdId, payload) {
  const edges = await prisma.edgeNode.findMany({
    where: { siteId, householdId },
    select: { id: true },
    orderBy: { lastSeenAt: 'desc' },
  });

  if (!edges.length) return 0;

  await prisma.edgeCommand.createMany({
    data: edges.map((e) => ({
      edgeId: e.id,
      status: 'queued',
      payload,
    })),
  });

  return edges.length;
}

/* ------------------------------- GET --------------------------------- */
/** GET /api/rooms?site_id=... */
r.get('/rooms', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const siteId = (req.query.site_id || '').toString();
    if (!siteId) return res.status(400).json({ error: 'site_id_required' });

    // site + membership баталгаажуулалт
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, householdId: true },
    });
    if (!site) return res.status(404).json({ error: 'site_not_found' });

    const member = await prisma.householdMember.findFirst({
      where: { householdId: site.householdId, userId: req.user.sub, status: 'active' },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    const rooms = await prisma.room.findMany({
      where: { siteId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        siteId: true,
        haAreaId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ ok: true, rooms });
  } catch (e) {
    console.error('[GET /api/rooms] error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

/* ------------------------------ POST --------------------------------- */
/** POST /api/rooms  Body: { site_id, name } */
r.post('/rooms', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const { site_id, name } = req.body || {};
    const siteId = (site_id || '').toString();
    const roomName = (name || '').toString().trim();

    if (!siteId || !roomName) return res.status(400).json({ error: 'bad_request' });

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, householdId: true },
    });
    if (!site) return res.status(404).json({ error: 'site_not_found' });

    const member = await prisma.householdMember.findFirst({
      where: { householdId: site.householdId, userId: req.user.sub, status: 'active' },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    // ✅ Required relations: site + household-г connect
    const room = await prisma.room.create({
      data: {
        name: roomName,
        site: { connect: { id: siteId } },
        household: { connect: { id: site.householdId } },
      },
      select: { id: true, siteId: true, name: true, haAreaId: true, createdAt: true },
    });

    // EdgeCommand queue — HA дээр area ensure
    await enqueueForSite(prisma, room.siteId, site.householdId, {
      id: room.id,                         // ← Хэрэв command id гэж тусгай ID байхгүй бол room.id-г хэрэглэж болно
      type: 'ha.area.ensure',             // ← poller заавал үүнийг харна
      deviceKey: `room_${room.id}`,       // ← ямар нэг unique string. room дээр бол `room_${id}` гэх мэт
      op: 'ha.area.ensure',
      event: 'room.created',
      siteId: room.siteId,
      householdId: site.householdId,
      room: { id: room.id, name: room.name },
      haAreaId: room.haAreaId ?? null,
      ts: new Date().toISOString(),
    });


    return res.json({ ok: true, room });
  } catch (e) {
    console.error('[POST /api/rooms] error:', e);
    if (e?.code === 'P2002') return res.status(409).json({ error: 'room_name_conflict' });
    return res.status(500).json({ error: 'server_error' });
  }
});

/* ------------------------------ PATCH -------------------------------- */
/** PATCH /api/rooms/:roomId  Body: { name? } */
r.patch('/rooms/:roomId', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const roomId = req.params.roomId?.toString() || '';
    const { name } = req.body || {};

    if (!roomId) return res.status(400).json({ error: 'room_id_required' });

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, name: true, siteId: true, haAreaId: true },
    });
    if (!room) return res.status(404).json({ error: 'room_not_found' });

    const site = await prisma.site.findUnique({
      where: { id: room.siteId },
      select: { id: true, householdId: true },
    });

    const member = await prisma.householdMember.findFirst({
      where: { householdId: site.householdId, userId: req.user.sub, status: 'active' },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    const newName = (name?.toString().trim() || room.name);

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: { name: newName },
      select: { id: true, siteId: true, name: true, haAreaId: true, updatedAt: true },
    });

    // EdgeCommand queue — rename
    await enqueueForSite(prisma, updated.siteId, site.householdId, {
      id: updated.id, 
      type: 'ha.area.rename',
      deviceKey: `room_${updated.id}`,
      op: 'ha.area.rename',
      event: 'room.updated',
      siteId: updated.siteId,
      householdId: site.householdId,
      room: { id: updated.id, name: updated.name },
      haAreaId: updated.haAreaId ?? null,
      ts: new Date().toISOString(),
    });

    return res.json({ ok: true, room: updated });
  } catch (e) {
    console.error('[PATCH /api/rooms/:roomId] error:', e);
    if (e?.code === 'P2002') return res.status(409).json({ error: 'room_name_conflict' });
    return res.status(500).json({ error: 'server_error' });
  }
});

r.patch('/rooms/:id/ha', auth, async (req, res) => {
  const { id } = req.params;
  const { haAreaId } = req.body || {};
  if (!haAreaId) return res.status(400).json({ error: 'haAreaId required' });

  const room = await prisma.room.update({
    where: { id },
    data: { haAreaId },
  });
  res.json({ ok: true, room });
});

/* ------------------------------ DELETE ------------------------------- */
/** DELETE /api/rooms/:roomId */
r.delete('/rooms/:roomId', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const roomId = req.params.roomId?.toString() || '';
    if (!roomId) return res.status(400).json({ error: 'room_id_required' });

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, siteId: true, name: true, haAreaId: true },
    });
    if (!room) return res.status(404).json({ error: 'room_not_found' });

    const site = await prisma.site.findUnique({
      where: { id: room.siteId },
      select: { id: true, householdId: true },
    });

    const member = await prisma.householdMember.findFirst({
      where: { householdId: site.householdId, userId: req.user.sub, status: 'active' },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    await prisma.room.delete({ where: { id: roomId } });

    // EdgeCommand queue — delete
    await enqueueForSite(prisma, room.siteId, site.householdId, {
      id: room.id, 
      type: 'ha.area.delete',
      deviceKey: `room_${room.id}`,
      op: 'ha.area.delete',
      event: 'room.deleted',
      siteId: room.siteId,
      householdId: site.householdId,
      room: { id: room.id, name: room.name },
      haAreaId: room.haAreaId ?? null,
      ts: new Date().toISOString(),
    });


    return res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/rooms/:roomId] error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

export default r;
