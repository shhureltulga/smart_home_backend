// server/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const r = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ACCESS_TTL = Number(process.env.ACCESS_TOKEN_TTL_SEC || 3600);   // 1h
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

const now = () => new Date();
const addDays = (d, x) => new Date(d.getTime() + x * 86400000);
const e164 = (p) => (p || '').replace(/[^0-9+]/g, '');
const signAccess = (u) =>
  jwt.sign({ sub: u.id, phone: u.phoneE164 }, JWT_SECRET, { expiresIn: ACCESS_TTL });

/** Prisma-г app.locals-оос авна */
const prismaOf = (req) => req.app.locals.prisma;

/* ---------- /auth/register ---------- */
r.post('/register', async (req, res) => {
  try {
    const prisma = prismaOf(req);
    const phone = e164(req.body.phone);
    const password = (req.body.password || '').trim();
    const displayName = req.body.displayName || phone;

    if (!phone.startsWith('+') || phone.length < 8) {
      return res.status(400).json({ error: 'invalid_phone' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'weak_password' });
    }

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

    res.json({ ok: true, user: { id: user.id, phone: user.phoneE164, display_name: user.displayName } });
  } catch (e) {
    console.error('[AUTH/register] error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---------- /auth/login ---------- */
r.post('/login', async (req, res) => {
  try {
    const prisma = prismaOf(req);
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
    console.error('[AUTH/login] error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---------- /auth/refresh ---------- */
r.post('/refresh', async (req, res) => {
  try {
    const prisma = prismaOf(req);
    const { session_id, refresh_token } = req.body || {};
    if (!session_id || !refresh_token) return res.status(400).json({ error: 'bad_request' });

    const s = await prisma.authSession.findUnique({ where: { id: session_id } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) {
      return res.status(401).json({ error: 'invalid_session' });
    }

    const ok = await bcrypt.compare(refresh_token, s.refreshTokenHash);
    if (!ok) return res.status(401).json({ error: 'invalid_refresh' });

    const newRefreshToken = uuidv4() + '.' + uuidv4();
    const newRefreshHash  = await bcrypt.hash(newRefreshToken, 10);
    const updated = await prisma.authSession.update({
      where: { id: s.id },
      data: { refreshTokenHash: newRefreshHash, expiresAt: addDays(now(), REFRESH_TTL_DAYS) }
    });

    const user = await prisma.user.findUnique({ where: { id: s.userId } });

    res.json({
      ok: true,
      access_token: signAccess(user),
      refresh_token: newRefreshToken,
      session_id: updated.id
    });
  } catch (e) {
    console.error('[AUTH/refresh] error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---------- /auth/logout ---------- */
r.post('/logout', async (req, res) => {
  try {
    const prisma = prismaOf(req);
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'bad_request' });

    await prisma.authSession.update({ where: { id: session_id }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  } catch (e) {
    console.error('[AUTH/logout] error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

export default r;
