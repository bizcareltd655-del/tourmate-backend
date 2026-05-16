import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, requireRole } from '../auth.js';

const router = Router();

// List users — admin sees all; manager/member see only basic info (for assigning tasks etc.)
router.get('/', authRequired, async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
  );
  res.json({ users: rows });
});

router.delete('/:id', authRequired, requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
