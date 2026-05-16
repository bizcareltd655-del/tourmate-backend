import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const mapTask = (t) => ({
  id: t.id,
  tourId: t.tour_id,
  title: t.title,
  assignedTo: t.assigned_to,
  status: t.status,
  priority: t.priority,
  dueDate: t.due_date,
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
  if (tourId) { params.push(tourId); where += ` AND k.tour_id = $${params.length}`; }
  // members see only their own tasks
  let memberFilter = '';
  if (u.role === 'member') memberFilter = ` AND k.assigned_to = $1`;
  const { rows } = await query(
    `SELECT DISTINCT k.* FROM tasks k
       JOIN tours t ON t.id = k.tour_id
       LEFT JOIN tour_members tm ON tm.tour_id = t.id AND tm.user_id = $1
       WHERE ${where}${memberFilter}
       ORDER BY k.created_at DESC`,
    params
  );
  res.json({ tasks: rows.map(mapTask) });
});

router.post('/', authRequired, async (req, res) => {
  const { tourId, title, assignedTo, status, priority, dueDate } = req.body || {};
  if (!tourId || !title) return res.status(400).json({ error: 'tourId, title required' });
  if (!(await userHasTourAccess(req.user, tourId))) return res.status(403).json({ error: 'No access' });
  const id = 'k_' + nanoid(10);
  const { rows } = await query(
    `INSERT INTO tasks (id, tour_id, title, assigned_to, status, priority, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, tourId, title.trim(), assignedTo || null, status || 'todo', priority || 'medium', dueDate || null]
  );
  res.status(201).json({ task: mapTask(rows[0]) });
});

router.patch('/:id', authRequired, async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Not found' });
  if (!(await userHasTourAccess(req.user, existing[0].tour_id))) return res.status(403).json({ error: 'No access' });
  const map = { title:'title', assignedTo:'assigned_to', status:'status', priority:'priority', dueDate:'due_date' };
  const fields = []; const values = []; let i = 1;
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) { fields.push(`${col} = $${i++}`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.json({ task: mapTask(existing[0]) });
  values.push(req.params.id);
  const { rows } = await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
  res.json({ task: mapTask(rows[0]) });
});

router.delete('/:id', authRequired, async (req, res) => {
  const { rows } = await query('SELECT tour_id FROM tasks WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (!(await userHasTourAccess(req.user, rows[0].tour_id))) return res.status(403).json({ error: 'No access' });
  await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
