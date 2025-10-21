// server/middleware/authz.js
export function requireRole(roles = []) {
  return (req, res, next) => {
    // TODO: JWT-ээс req.user.role авч шалгана.
    // Одоохондоо owner гэж үзээд нэвтрүүлж, production-д бодитоор солино.
    const role = req?.user?.role || 'owner';
    if (!roles.length || roles.includes(role)) return next();
    return res.status(403).json({ error: 'forbidden' });
  };
}
