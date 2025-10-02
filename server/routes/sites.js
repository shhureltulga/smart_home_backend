// server/routes/sites.js
import { Router } from 'express';
import jwt from 'jsonwebtoken';               // ← ESM import

const r = Router();

// JWT auth (ACCESS токеноо шалгана)
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
  } catch (e) {
    console.error('[sites.auth] verify error:', e?.message || e);
    return res.status(401).json({ error: 'unauthorized' });
  }
}

/**
 * GET /api/sites?household_id=...
 */
r.get('/sites', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const householdId = (req.query.household_id || '').toString();
    if (!householdId) return res.status(400).json({ error: 'household_id_required' });

    const member = await prisma.householdMember.findFirst({
      where: { householdId, userId: req.user.sub, status: 'active' },
      select: { id: true }
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    const sites = await prisma.site.findMany({
      where: { householdId },
      select: { id: true, name: true, address: true, createdAt: true }
    });

    return res.json({ ok: true, sites });
  } catch (e) {
    console.error('[GET /api/sites] error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

/**
 * POST /api/sites
 * Body: { household_id, name, address? }
 */
r.post('/sites', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const { household_id, name, address } = req.body || {};
    const householdId = (household_id || '').toString();

    if (!householdId || !name) return res.status(400).json({ error: 'bad_request' });

    const member = await prisma.householdMember.findFirst({
      where: { householdId, userId: req.user.sub, status: 'active' },
      select: { role: true }
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    const site = await prisma.site.create({
      data: { householdId, name: String(name), address: address?.toString() },
      select: { id: true, name: true, address: true, createdAt: true }
    });

    return res.json({ ok: true, site });
  } catch (e) {
    console.error('[POST /api/sites] error:', e);
    if (e?.code === 'P2002') return res.status(409).json({ error: 'site_name_conflict' });
    return res.status(500).json({ error: 'server_error' });
  }
});

/**
 * GET /api/edge/status?site_id=...
 */
r.get('/edge/status', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const siteId = (req.query.site_id || '').toString();
    if (!siteId) return res.status(400).json({ error: 'site_id_required' });

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, householdId: true }
    });
    if (!site) return res.status(404).json({ error: 'site_not_found' });

    const member = await prisma.householdMember.findFirst({
      where: { householdId: site.householdId, userId: req.user.sub, status: 'active' },
      select: { id: true }
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    const edge = await prisma.edgeNode.findFirst({
      where: { siteId },
      select: { id: true, edgeId: true, status: true, lastSeenAt: true }
    });

    return res.json({ ok: true, edge });
  } catch (e) {
    console.error('[GET /api/edge/status] error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

export default r;
