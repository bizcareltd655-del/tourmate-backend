import { Router } from 'express';
import { nanoid } from 'nanoid';
import { pool, query } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

// Map DB row → JSON
const mapTour = (t, members = []) => ({
  id: t.id,
  name: t.name,
  destination: t.destination,
  startDate: t.start_date,
  endDate: t.end_date,
  budget: Number(t.budget),
  status: t.status,
  cover: t.cover,
  createdBy: t.created_by,
  members,
});

// List tours visible to current user
router.get('/', authRequired, async (req, res) => {
  const u = req.user;
  const sql = u.role === 'admin'
    ? 'SELECT * FROM tours ORDER BY created_at DESC'
    : `SELECT t.* FROM tours t
         LEFT JOIN tour_members tm ON tm.tour_id = t.id
         WHERE t.created_by = $1 OR tm.user_id = $1
         GROUP BY t.id ORDER BY t.created_at DESC`;
  const { rows: tours } = await query(sql, u.role === 'admin' ? [] : [u.id]);
  if (!tours.length) return res.json({ tours: [] });
  const ids = tours.map(t => t.id);
  const { rows: mems } = await query('SELECT tour_id, user_id FROM tour_members WHERE tour_id = ANY($1)', [ids]);
  const memByTour = {};
  mems.forEach(m => { (memByTour[m.tour_id] = memByTour[m.tour_id] || []).push(m.user_id); });
  res.json({ tours: tours.map(t => mapTour(t, memByTour[t.id] || [])) });
});

// Single tour
router.get('/:id', authRequired, async (req, res) => {
  const { rows } = await query('SELECT * FROM tours WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const t = rows[0];
  const u = req.user;
  const { rows: mems } = await query('SELECT user_id FROM tour_members WHERE tour_id = $1', [t.id]);
  const memberIds = mems.map(m => m.user_id);
  if (u.role !== 'admin' && t.created_by !== u.id && !memberIds.includes(u.id))
    return res.status(403).json({ error: 'No access' });
  res.json({ tour: mapTour(t, memberIds) });
});

// Create
router.post('/', authRequired, async (req, res) => {
  if (req.user.role === 'member') return res.status(403).json({ error: 'Only managers/admins can create tours' });
  const { name, destination, startDate, endDate, budget, status, cover, members = [] } = req.body || {};
  if (!name || !destination || !startDate || !endDate)
    return res.status(400).json({ error: 'name, destination, startDate, endDate required' });
  const id = 't_' + nanoid(10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO tours (id, name, destination, start_date, end_date, budget, status, cover, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, name.trim(), destination.trim(), startDate, endDate, budget || 0, status || 'planning', cover || '✈️', req.user.id]
    );
    // creator is auto-member
    const allMembers = Array.from(new Set([req.user.id, ...members]));
    for (const uid of allMembers) {
      await client.query('INSERT INTO tour_members (tour_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, uid]);
    }
    await client.query('COMMIT');
    const { rows } = await query('SELECT * FROM tours WHERE id = $1', [id]);
    res.status(201).json({ tour: mapTour(rows[0], allMembers) });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// Update
router.patch('/:id', authRequired, async (req, res) => {
  const { rows } = await query('SELECT * FROM tours WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const t = rows[0];
  if (req.user.role !== 'admin' && t.created_by !== req.user.id)
    return res.status(403).json({ error: 'Only creator or admin can edit' });
  const fields = []; const values = []; let i = 1;
  const map = { name: 'name', destination: 'destination', startDate: 'start_date', endDate: 'end_date',
                budget: 'budget', status: 'status', cover: 'cover' };
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) { fields.push(`${col} = $${i++}`); values.push(req.body[k]); }
  }
  if (fields.length) {
    values.push(req.params.id);
    await query(`UPDATE tours SET ${fields.join(', ')} WHERE id = $${i}`, values);
  }
  if (Array.isArray(req.body.members)) {
    const allMembers = Array.from(new Set([t.created_by, ...req.body.members]));
    await query('DELETE FROM tour_members WHERE tour_id = $1', [req.params.id]);
    for (const uid of allMembers) {
      await query('INSERT INTO tour_members (tour_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, uid]);
    }
  }
  const { rows: t2 } = await query('SELECT * FROM tours WHERE id = $1', [req.params.id]);
  const { rows: mems } = await query('SELECT user_id FROM tour_members WHERE tour_id = $1', [req.params.id]);
  res.json({ tour: mapTour(t2[0], mems.map(m => m.user_id)) });
});

// Delete
router.delete('/:id', authRequired, async (req, res) => {
  const { rows } = await query('SELECT created_by FROM tours WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });
  await query('DELETE FROM tours WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Add member
router.post('/:id/members', authRequired, async (req, res) => {
  const { rows } = await query('SELECT created_by FROM tours WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  await query('INSERT INTO tour_members (tour_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, userId]);
  res.json({ ok: true });
});

// Remove member
router.delete('/:id/members/:userId', authRequired, async (req, res) => {
  const { rows } = await query('SELECT created_by FROM tours WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });
  if (req.params.userId === rows[0].created_by)
    return res.status(400).json({ error: 'Cannot remove tour creator' });
  await query('DELETE FROM tour_members WHERE tour_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
  res.json({ ok: true });
});

export default router;
