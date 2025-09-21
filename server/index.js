import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import deviceRoutes from '../src/routes/devices.js';      // ← доорхыг нэмнэ
import edgeRoutes from '../src/routes/edge.routes.js';    // ← edge webhook

import app from './app.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true }));
app.use(express.json());


app.listen(PORT, () => console.log(`API listening on :${PORT}`));

const prisma = new PrismaClient();

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ACCESS_TTL = Number(process.env.ACCESS_TOKEN_TTL_SEC || 3600);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

const now = () => new Date();
const addDays = (d, x) => new Date(d.getTime() + x * 86400000);
const e164 = (p) => (p || '').replace(/[^0-9+]/g, '');
const signAccess = (u) => jwt.sign({ sub: u.id, phone: u.phoneE164 }, JWT_SECRET, { expiresIn: ACCESS_TTL });

app.get('/health', (_, res) => res.json({ ok: true }));

/* =====================  AUTH  ===================== */

app.post('/auth/register', async (req, res) => {
  try {
    const phone = e164(req.body.phone);
    const password = (req.body.password || '').trim();
    const displayName = req.body.displayName || phone;

    if (!phone.startsWith('+') || phone.length < 8) return res.status(400).json({ error: 'invalid_phone' });
    if (password.length < 6) return res.status(400).json({ error: 'weak_password' });

    const exists = await prisma.user.findUnique({ where: { phoneE164: phone } });
    if (exists?.passwordHash) return res.status(400).json({ error: 'user_exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = exists
      ? await prisma.user.update({
          where: { phoneE164: phone },
          data: { passwordHash, passwordSetAt: new Date(), displayName }
        })
      : await prisma.user.create({
          data: { phoneE164: phone, displayName, passwordHash, passwordSetAt: new Date() }
        });

    res.json({ ok: true, user: { id: user.id, phone: user.phoneE164, display_name: user.displayName }});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const phone = e164(req.body.phone);
    const password = (req.body.password || '').trim();
    if (!phone || !password) return res.status(400).json({ error: 'bad_request' });

    const user = await prisma.user.findUnique({ where: { phoneE164: phone } });
    if (!user?.passwordHash) return res.status(400).json({ error: 'user_not_found_or_password_not_set' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'invalid_credentials' });

    const refreshToken = uuidv4() + '.' + uuidv4();
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const session = await prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: refreshHash,
        userAgent: req.get('user-agent') || undefined,
        ip: req.ip,
        expiresAt: addDays(now(), REFRESH_TTL_DAYS)
      }
    });

    res.json({
      ok: true,
      user: { id: user.id, phone: user.phoneE164, display_name: user.displayName },
      access_token: signAccess(user),
      refresh_token: refreshToken,
      session_id: session.id
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

function auth(req, res, next) {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'unauthorized' }); }
}

app.get('/me', auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, phoneE164: true, displayName: true }
  });
  const households = await prisma.householdMember.findMany({
    where: { userId: req.user.sub, status: 'active' },
    select: { role: true, household: { select: { id: true, name: true } } }
  });
  res.json({ ok: true, user, households });
});

app.post('/households', auth, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name_required' });

  const h = await prisma.household.create({ data: { name, createdById: req.user.sub } });
  await prisma.householdMember.create({
    data: { householdId: h.id, userId: req.user.sub, role: 'owner', status: 'active' }
  });
  res.json({ ok: true, household: h });
});
app.post('/auth/refresh', async (req, res) => {
  try {
    const { session_id, refresh_token } = req.body || {};
    if (!session_id || !refresh_token) return res.status(400).json({ error: 'bad_request' });

    const s = await prisma.authSession.findUnique({ where: { id: session_id } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) return res.status(401).json({ error: 'invalid_session' });

    const ok = await bcrypt.compare(refresh_token, s.refreshTokenHash);
    if (!ok) return res.status(401).json({ error: 'invalid_refresh' });

    const newRefreshToken = uuidv4() + '.' + uuidv4();
    const newRefreshHash  = await bcrypt.hash(newRefreshToken, 10);
    const updated = await prisma.authSession.update({
      where: { id: s.id },
      data: { refreshTokenHash: newRefreshHash, expiresAt: addDays(now(), 30) }
    });

    const user = await prisma.user.findUnique({ where: { id: s.userId } });
    res.json({
      ok: true,
      access_token: signAccess(user),
      refresh_token: newRefreshToken,
      session_id: updated.id
    });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'server_error' });
  }
});

app.post('/auth/logout', auth, async (req, res) => {
  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'bad_request' });
    const s = await prisma.authSession.findUnique({ where: { id: session_id } });
    if (!s || s.userId !== req.user.sub) return res.status(404).json({ error: 'not_found' });
    await prisma.authSession.update({ where: { id: session_id }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'server_error' });
  }
});

app.post('/auth/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password || new_password.length < 6)
      return res.status(400).json({ error: 'bad_request' });

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user?.passwordHash) return res.status(400).json({ error: 'password_not_set' });

    const ok = await bcrypt.compare(current_password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'invalid_current_password' });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(new_password, 10), passwordSetAt: new Date() }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'server_error' });
  }
});

/* =====================  API ROUTES  ===================== */

/** JWT шаардлагатай хэрэглэгчийн API */
app.use('/api', auth, deviceRoutes);

/** Edge webhook (JWT-гүй, HMAC-аар баталгаажна) */
app.use('/edgehooks', edgeRoutes);

/* =====================  START  ===================== */

app.listen(PORT, () => console.log(`API listening on :${PORT}`));
