// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { PrismaClient } from '@prisma/client';

import complexes from './routes/complexes.js';
import unitRoutes from './routes/units.js';

// Routes
import deviceRoutes from './routes/devices.js';
import edgeRoutes from '../src/routes/edge.routes.js';
import authRoutes from './routes/auth.js';
import { auth } from './middleware/auth.js';
import siteRoutes from './routes/sites.js';
import roomsRoutes from './routes/rooms.js';
import { emitEdge } from './utils/emit.js';
// NEW: PBD upload + latest
import pbdRoutes from './routes/pbd.js';
import { getLatestForSite } from '../src/controllers/pbdLatest.js';



const app = express();
app.set('trust proxy', 1);

// CORS + body parsers
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Prisma → app.locals
const prisma = new PrismaClient();
app.locals.prisma = prisma;

// Config
const PORT = Number(process.env.PORT || 4000);

// ===== Static /cdn (PBD татах, ETag/Cache-Control) =====
const CDN_ROOT = process.env.CDN_ROOT || '/var/app/cdn';
app.use('/cdn', express.static(CDN_ROOT, {
  etag: true,
  maxAge: '1d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  }
}));


// Health
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ---------- Diagnostic logger: Edge webhooks ---------- */
app.use((req, _res, next) => {
  if (req.path.startsWith('/edgehooks')) {
    console.log(`[EDGEHOOKS] ${req.method} ${req.path}`);
  }
  next();
});

/* ---------- AUTH ROUTES (хоёр alias: /auth ба /api/auth) ---------- */
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);

/* ---------- /me (JWT) ---------- */
app.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, phoneE164: true, displayName: true }
    });

    const households = await prisma.householdMember.findMany({
      where: { userId: req.user.sub, status: 'active' },
      select: { role: true, household: { select: { id: true, name: true } } }
    });

    res.json({ ok: true, user, households });
  } catch (e) {
    console.error('[ME] error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.use('/api/devices', deviceRoutes);

/* ---------- JWT шаардлагатай хэрэглэгчийн API ---------- */
app.use('/api', auth, deviceRoutes);
app.use('/api', /* auth, */ siteRoutes);
app.use('/api', roomsRoutes);

app.use('/api/complexes', complexes);
app.use('/api/units', unitRoutes);
/* ---------- PBD: Upload (админ/портал) + Latest (апп) ---------- */
// Upload: JWT-ээр хамгаалж (хэрэв админ шаардлагатай бол нэмэлт role guard тавина)
app.use('/api/pbd', auth, pbdRoutes);
// Latest: апп унших (JWT-ээр хамгаална; дотор нь site-access шалгалт хийх боломжтой)
app.get('/api/site/:siteId/pbd/latest', auth, getLatestForSite);

/* ---------- Edge webhook (JWT-гүй, HMAC) ---------- */
app.use('/edgehooks', edgeRoutes);



/* ---------- 404 & error handlers ---------- */
app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));
app.use((err, _req, res, _next) => {
  console.error('[UNCAUGHT]', err);
  res.status(500).json({ error: 'server_error' });
});

/* ---------- START & graceful shutdown ---------- */
const server = app.listen(PORT, () => console.log(`API listening on :${PORT}`));

const shutdown = async () => {
  try {
    await prisma.$disconnect();
  } catch {}
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
