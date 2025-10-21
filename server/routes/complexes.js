// server/routes/complexes.js
import { Router } from 'express';
import prisma from '../prisma.js';
import { requireRole } from '../middleware/authz.js';
import { validateComplexBody } from '../middleware/validateComplex.js';

const r = Router();

// CREATE Complex (nested blocks/entrances/units сонголтоор)
r.post('/', requireRole(['owner','admin']), validateComplexBody, async (req, res, next) => {
  try {
    const { name, city, district, address, centerLat, centerLng, geo, photoUrl, blocks, units } = req.body || {};
    const complex = await prisma.complex.create({
      data: {
        name, city, district, address, centerLat, centerLng, geo, photoUrl,
        blocks: Array.isArray(blocks) && blocks.length
          ? {
              create: blocks.map((b) => ({
                name: b.name,
                floors: b.floors ?? null,
                entrances: b.entrances ?? null,
                entrancesR: Array.isArray(b.entranceList) && b.entranceList.length
                  ? { create: b.entranceList.map((e) => ({ name: e.name })) }
                  : undefined,
              })),
            }
          : undefined,
        units: Array.isArray(units) && units.length
          ? {
              create: units.map((u) => ({
                number: u.number,
                floor: u.floor ?? null,
                areaSqm: u.areaSqm ?? null,
                status: u.status ?? null,
              })),
            }
          : undefined,
      },
    });
    res.json(complex);
  } catch (e) { next(e); }
});

// LIST + filter
r.get('/', async (req, res, next) => {
  try {
    const { q, city, district } = req.query || {};
    const complexes = await prisma.complex.findMany({
      where: {
        AND: [
          city ? { city } : {},
          district ? { district } : {},
          q ? { name: { contains: String(q), mode: 'insensitive' } } : {},
        ],
      },
      select: { id: true, name: true, city: true, district: true, address: true, centerLat: true, centerLng: true },
    });
    res.json(complexes);
  } catch (e) { next(e); }
});

// DETAIL (nested)
r.get('/:id', async (req, res, next) => {
  try {
    const complex = await prisma.complex.findUnique({
      where: { id: req.params.id },
      include: { blocks: { include: { entrancesR: true } }, units: true },
    });
    res.json(complex);
  } catch (e) { next(e); }
});

// UPDATE
r.put('/:id', requireRole(['owner','admin']), validateComplexBody, async (req, res, next) => {
  try {
    const { name, city, district, address, centerLat, centerLng, geo, photoUrl } = req.body || {};
    const up = await prisma.complex.update({
      where: { id: req.params.id },
      data: { name, city, district, address, centerLat, centerLng, geo, photoUrl },
    });
    res.json(up);
  } catch (e) { next(e); }
});

// DELETE (каскад цэвэрлэгээ)
r.delete('/:id', requireRole(['owner','admin']), async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.unit.deleteMany({ where: { complexId: id } });
    await prisma.entrance.deleteMany({ where: { block: { complexId: id } } });
    await prisma.block.deleteMany({ where: { complexId: id } });
    await prisma.complex.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
