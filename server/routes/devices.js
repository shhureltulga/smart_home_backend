import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const r = Router();

// Өөрийн household-ууд
r.get('/households', async (req, res) => {
  const rows = await prisma.householdMember.findMany({
    where: { userId: req.user.sub, status: 'active' },
    select: { role: true, household: { select: { id: true, name: true } } }
  });
  res.json({ ok: true, households: rows.map(x => ({ id: x.household.id, name: x.household.name, role: x.role })) });
});

// Нэг household-ын rooms + devices
r.get('/households/:hid/overview', async (req, res) => {
  const hid = req.params.hid;
  // эрх шалгах
  const member = await prisma.householdMember.findFirst({ where: { householdId: hid, userId: req.user.sub, status: 'active' } });
  if (!member) return res.status(403).json({ error: 'forbidden' });

  const rooms = await prisma.room.findMany({ where: { householdId: hid } });
  const devices = await prisma.device.findMany({ where: { householdId: hid } });
  const latest = await prisma.latestSensor.findMany({ where: { householdId: hid } });

  res.json({ ok: true, rooms, devices, latest });
});

r.post('/devices/register', async (req, res) => {
  const {
    deviceKey, siteId, householdId, name, type,
    domain, deviceClass, roomId, floorId, pos
  } = req.body;

  if (!deviceKey || !siteId || !householdId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const device = await prisma.device.upsert({
    where: { id: deviceKey },
    update: {
      name, type, domain, deviceClass, roomId, floorId, pos,
      updatedAt: new Date()
    },
    create: {
      id: deviceKey,
      siteId, householdId, name, type,
      domain, deviceClass, roomId, floorId, pos
    }
  });

  return res.json({ ok: true, device });
});

r.patch('/devices/:id/room', async (req, res) => {
  const { id } = req.params;
  const { roomId } = req.body;

  if (!roomId) return res.status(400).json({ error: 'roomId required' });

  const device = await prisma.device.update({
    where: { id },
    data: { roomId, updatedAt: new Date() }
  });

  res.json({ ok: true, device });
});

r.patch('/devices/:id/position', async (req, res) => {
  const { id } = req.params;
  const { pos } = req.body;

  if (!pos || typeof pos !== 'object') {
    return res.status(400).json({ error: 'pos (object) required' });
  }

  const device = await prisma.device.update({
    where: { id },
    data: { pos, updatedAt: new Date() }
  });

  res.json({ ok: true, device });
});

export default r;
