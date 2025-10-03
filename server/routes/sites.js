// server/routes/sites.js
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { fetchWeatherNow } from '../utils/weather.js';

const r = Router();

// --- Auth middleware
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

/* ===================== SITES LIST ===================== */
r.get('/sites', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const householdId = (req.query.household_id || '').toString();
    if (!householdId) return res.status(400).json({ error: 'household_id_required' });

    const member = await prisma.householdMember.findFirst({
      where: { householdId, userId: req.user.sub, status: 'active' },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    const sites = await prisma.site.findMany({
      where: { householdId },
      select: { id: true, name: true, address: true, createdAt: true },
    });

    return res.json({ ok: true, sites });
  } catch (e) {
    console.error('[GET /api/sites] error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

/* ===================== CREATE SITE ===================== */
r.post('/sites', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const { household_id, name, address } = req.body || {};
    const householdId = (household_id || '').toString();

    if (!householdId || !name) return res.status(400).json({ error: 'bad_request' });

    const member = await prisma.householdMember.findFirst({
      where: { householdId, userId: req.user.sub, status: 'active' },
      select: { role: true },
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    const site = await prisma.site.create({
      data: { householdId, name: String(name), address: address?.toString() },
      select: { id: true, name: true, address: true, createdAt: true },
    });

    return res.json({ ok: true, site });
  } catch (e) {
    console.error('[POST /api/sites] error:', e);
    if (e?.code === 'P2002') return res.status(409).json({ error: 'site_name_conflict' });
    return res.status(500).json({ error: 'server_error' });
  }
});

/* ===================== EDGE STATUS ===================== */
r.get('/edge/status', auth, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const siteId = (req.query.site_id || '').toString();
    if (!siteId) return res.status(400).json({ error: 'site_id_required' });

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

    const edge = await prisma.edgeNode.findFirst({
      where: { siteId },
      select: { id: true, edgeId: true, status: true, lastSeenAt: true },
    });

    return res.json({ ok: true, edge });
  } catch (e) {
    console.error('[GET /api/edge/status] error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

/* ================ OVERVIEW: GET /api/sites/:siteId/overview ================ */
r.get('/sites/:siteId/overview', auth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const siteId = req.params.siteId?.toString() || '';

  try {
    if (!siteId) return res.status(400).json({ ok: false, error: 'site_id_required' });

    // 1) Site + household (+ координат) авах
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        address: true,
        householdId: true,
        createdAt: true,
        // ⬇️ ЭНЭ 2 МАШ ЧУХАЛ: weather авахын тулд координат хэрэгтэй
        latitude: true,
        longitude: true,
      },
    });
    if (!site) return res.status(404).json({ ok: false, error: 'site_not_found' });

    // 2) Хэрэглэгч household-ийн идэвхтэй гишүүн эсэх
    const member = await prisma.householdMember.findFirst({
      where: { householdId: site.householdId, userId: req.user.sub, status: 'active' },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ ok: false, error: 'forbidden' });

    // 3) Edge статус
    const edge = await prisma.edgeNode.findFirst({
      where: { siteId },
      select: { id: true, edgeId: true, status: true, lastSeenAt: true },
    });

    // 4) Тоолуур/stat
    const [roomCount, deviceCount, lastReadAt] = await Promise.all([
      prisma.room.count({ where: { siteId } }),
      prisma.device.count({ where: { siteId } }),
      prisma.sensorReading.findFirst({
        where: { siteId },
        orderBy: { ts: 'desc' },
        select: { ts: true },
      }),
    ]);

    // 5) Сүүлийн мэдрэгчүүд
    const latest = await prisma.latestSensor.findMany({
      where: { siteId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        deviceKey: true,
        type: true,
        value: true,
        ts: true,
        updatedAt: true,
      },
    });

    // 6) Цаг агаар — координат байвал л дуудна
    let weather = null;
    try {
      if (site.latitude != null && site.longitude != null) {
        const w = await fetchWeatherNow(site.latitude, site.longitude);
        if (w) {
          weather = {
            tempC: Number.isFinite(w.tempC) ? w.tempC : null,
            humidity: Number.isFinite(w.humidity) ? w.humidity : null,
            windSpeedMs: Number.isFinite(w.windSpeedMs) ? w.windSpeedMs : null,
            rainProb: Number.isFinite(w.rainProb) ? w.rainProb : null,
          };
        }
      }
    } catch (we) {
      console.warn('[overview] weather fetch failed:', we?.message || we);
      weather = null; // цаг агаар унасан ч overview амжилттай үлдэнэ
    }

    return res.json({
      ok: true,
      site: {
        id: site.id,
        name: site.name,
        address: site.address,
      },
      edge: edge || null,
      stats: {
        rooms: roomCount,
        devices: deviceCount,
        lastReadingAt: lastReadAt?.ts || null,
      },
      latestSensors: latest,
      // ⬇️ Апп тал хүлээдэг талбар
      weather,
    });
  } catch (e) {
    console.error('[GET /api/sites/:siteId/overview] error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default r;
