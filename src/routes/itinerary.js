import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const mapItin = (i) => ({
  id: i.id,
  tourId: i.tour_id,
  title: i.title,
  date: i.date,
  time: i.time,
  location: i.location,
  note: i.note,
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

router.get('/', authRequired, async (req, res) => {
  const u = req.user;
  const { tourId } = req.query;
  const params = [u.id, u.role];
  let where = '(t.created_by = $1 OR tm.user_id = $1 OR $2 = \'admin\')';
  if (tourId) { params.push(tourId); where += ` AND i.tour_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT DISTINCT i.* FROM itinerary i
       JOIN tours t ON t.id = i.tour_id
       LEFT JOIN tour_members tm ON tm.tour_id = t.id AND tm.user_id = $1
       WHERE ${where}
       ORDER BY i.date, i.time`,
    params
  );
  res.json({ itinerary: rows.map(mapItin) });
});

router.post('/', authRequired, async (req, res) => {
  const { tourId, title, date, time, location, note } = req.body || {};
  if (!tourId || !title || !date || !time) return res.status(400).json({ error: 'tourId, title, date, time required' });
  if (!(await userHasTourAccess(req.user, tourId))) return res.status(403).json({ error: 'No access' });
  const id = 'i_' + nanoid(10);
  const { rows } = await query(
    `INSERT INTO itinerary (id, tour_id, title, date, time, location, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, tourId, title.trim(), date, time, location || null, note || null]
  );
  res.status(201).json({ itinerary: mapItin(rows[0]) });
});

router.patch('/:id', authRequired, async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM itinerary WHERE id = $1', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Not found' });
  if (!(await userHasTourAccess(req.user, existing[0].tour_id))) return res.status(403).json({ error: 'No access' });
  const map = { title:'title', date:'date', time:'time', location:'location', note:'note' };
  const fields = []; const values = []; let i = 1;
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) { fields.push(`${col} = $${i++}`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.json({ itinerary: mapItin(existing[0]) });
  values.push(req.params.id);
  const { rows } = await query(`UPDATE itinerary SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
  res.json({ itinerary: mapItin(rows[0]) });
});

router.delete('/:id', authRequired, async (req, res) => {
  const { rows } = await query('SELECT tour_id FROM itinerary WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (!(await userHasTourAccess(req.user, rows[0].tour_id))) return res.status(403).json({ error: 'No access' });
  await query('DELETE FROM itinerary WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
