// server/middleware/auth.js
import jwt from 'jsonwebtoken';

export function auth(req, res, next) {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.user = payload; // { sub, phone }
    return next();
  } catch (_e) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
