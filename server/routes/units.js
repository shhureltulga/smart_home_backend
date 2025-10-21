// server/routes/units.js
import { Router } from 'express';
import prisma from '../prisma.js';
import { requireRole } from '../middleware/authz.js';

const r = Router();

// Unit -> link Site (1:1)
r.put('/:unitId/link-site/:siteId', requireRole(['owner','admin']), async (req, res, next) => {
  try {
    const { unitId, siteId } = req.params;

    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const taken = await prisma.unit.findFirst({ where: { siteId } });
    if (taken && taken.id !== unitId) {
      return res.status(409).json({ error: 'This Site is already linked to another Unit.' });
    }

    const up = await prisma.unit.update({
      where: { id: unitId },
      data: { siteId },
      select: { id: true, number: true, siteId: true },
    });
    res.json(up);
  } catch (e) { next(e); }
});

// unlink
r.put('/:unitId/unlink-site', requireRole(['owner','admin']), async (req, res, next) => {
  try {
    const { unitId } = req.params;
    const up = await prisma.unit.update({
      where: { id: unitId },
      data: { siteId: null },
      select: { id: true, number: true, siteId: true },
    });
    res.json(up);
  } catch (e) { next(e); }
});

export default r;
