import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query } from '../db.js';
import { hashPassword, verifyPassword, signToken, authRequired } from '../auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be ≥ 6 chars' });
  const normalizedEmail = String(email).toLowerCase().trim();
  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.length) return res.status(409).json({ error: 'Email already exists' });
  const hashed = await hashPassword(password);
  const id = 'u_' + nanoid(10);
  const finalRole = ['admin', 'manager', 'member'].includes(role) ? role : 'member';
  const { rows } = await query(
    `INSERT INTO users (id, name, email, password, role) VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, email, role`,
    [id, name.trim(), normalizedEmail, hashed, finalRole]
  );
  const user = rows[0];
  res.status(201).json({ user, token: signToken(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email, password required' });
  const { rows } = await query(
    'SELECT id, name, email, role, password FROM users WHERE email = $1',
    [String(email).toLowerCase().trim()]
  );
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const user = rows[0];
  const ok = await verifyPassword(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  delete user.password;
  res.json({ user, token: signToken(user) });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/me', authRequired, async (req, res) => {
  const { name, email, password } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (name)  { fields.push(`name  = $${i++}`); values.push(name.trim()); }
  if (email) { fields.push(`email = $${i++}`); values.push(String(email).toLowerCase().trim()); }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be ≥ 6 chars' });
    fields.push(`password = $${i++}`); values.push(await hashPassword(password));
  }
  if (!fields.length) return res.json({ user: req.user });
  values.push(req.user.id);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, email, role`,
    values
  );
  res.json({ user: rows[0] });
});

export default router;
