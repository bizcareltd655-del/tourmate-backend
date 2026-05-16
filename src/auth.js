import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export const hashPassword = (p) => bcrypt.hash(p, 10);
export const verifyPassword = (p, h) => bcrypt.compare(p, h);

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    const payload = jwt.verify(token, SECRET);
    const { rows } = await query('SELECT id, name, email, role FROM users WHERE id = $1', [payload.id]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

// Confirm current user is a member of (or creator of) the tour, else admin
export async function ensureTourAccess(req, res, next) {
  const tourId = req.params.tourId || req.params.id || req.body.tourId || req.query.tourId;
  if (!tourId) return next();
  const { rows } = await query(
    `SELECT t.id, t.created_by FROM tours t
       LEFT JOIN tour_members tm ON tm.tour_id = t.id AND tm.user_id = $2
       WHERE t.id = $1 AND ($3 = 'admin' OR t.created_by = $2 OR tm.user_id = $2)`,
    [tourId, req.user.id, req.user.role]
  );
  if (!rows.length) return res.status(403).json({ error: 'No access to this tour' });
  req.tour = rows[0];
  next();
}
