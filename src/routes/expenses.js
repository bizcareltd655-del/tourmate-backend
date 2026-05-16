import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const mapExpense = (e) => ({
  id: e.id,
  tourId: e.tour_id,
  title: e.title,
  category: e.category,
  amount: Number(e.amount),
  paidBy: e.paid_by,
  date: e.date,
  note: e.note,
  splitBetween: e.split_between,
});

async function userHasTourAccess(user, tourId) {
  if (user.role === 'admin') return true;
  const { rows } = await query(
    `SELECT 1 FROM tours t LEFT JOIN tour_members tm ON tm.tour_id = t.id AND tm.user_id = $1
       WHERE t.id = $2 AND (t.created_by = $1 OR tm.user_id = $1)`,
    [user.id, tourId]
  );
  return rows.length > 0;
}

// List expenses (optionally filtered by tourId, category)
router.get('/', authRequired, async (req, res) => {
  const { tourId, category } = req.query;
  const u = req.user;
  const params = [u.id, u.role];
  let where = '(t.created_by = $1 OR tm.user_id = $1 OR $2 = \'admin\')';
  if (tourId) { params.push(tourId); where += ` AND e.tour_id = $${params.length}`; }
  if (category) { params.push(category); where += ` AND e.category = $${params.length}`; }
  const { rows } = await query(
    `SELECT DISTINCT e.* FROM expenses e
       JOIN tours t ON t.id = e.tour_id
       LEFT JOIN tour_members tm ON tm.tour_id = t.id AND tm.user_id = $1
       WHERE ${where}
       ORDER BY e.date DESC, e.created_at DESC`,
    params
  );
  res.json({ expenses: rows.map(mapExpense) });
});

router.post('/', authRequired, async (req, res) => {
  const { tourId, title, category, amount, paidBy, date, note, splitBetween } = req.body || {};
  if (!tourId || !title || amount == null || !paidBy || !date || !Array.isArray(splitBetween) || !splitBetween.length)
    return res.status(400).json({ error: 'Missing required fields' });
  if (!(await userHasTourAccess(req.user, tourId))) return res.status(403).json({ error: 'No access' });
  const id = 'e_' + nanoid(10);
  const { rows } = await query(
    `INSERT INTO expenses (id, tour_id, title, category, amount, paid_by, date, note, split_between)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, tourId, title.trim(), category || 'other', amount, paidBy, date, note || null, splitBetween]
  );
  res.status(201).json({ expense: mapExpense(rows[0]) });
});

router.patch('/:id', authRequired, async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Not found' });
  const e = existing[0];
  if (req.user.role === 'member' && e.paid_by !== req.user.id)
    return res.status(403).json({ error: 'Only payer can edit' });
  if (!(await userHasTourAccess(req.user, e.tour_id))) return res.status(403).json({ error: 'No access' });
  const map = { title:'title', category:'category', amount:'amount', paidBy:'paid_by', date:'date', note:'note', splitBetween:'split_between' };
  const fields = []; const values = []; let i = 1;
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) { fields.push(`${col} = $${i++}`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.json({ expense: mapExpense(e) });
  values.push(req.params.id);
  const { rows } = await query(`UPDATE expenses SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
  res.json({ expense: mapExpense(rows[0]) });
});

router.delete('/:id', authRequired, async (req, res) => {
  const { rows } = await query('SELECT paid_by, tour_id FROM expenses WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'member' && rows[0].paid_by !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });
  if (!(await userHasTourAccess(req.user, rows[0].tour_id))) return res.status(403).json({ error: 'No access' });
  await query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
