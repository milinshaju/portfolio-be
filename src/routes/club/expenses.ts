import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Expense } from '../../models/Expense';
import { requireAuth, requireRole, type AuthedRequest } from '../../middleware/auth';
import { isDbConnected } from '../../db';

const router = Router();

const requireManager = requireRole('admin', 'super_admin');

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

router.get('/', requireAuth, requireDb, async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const q: Record<string, unknown> = {};
  if (from || to) {
    q.date = {};
    if (from) (q.date as Record<string, string>).$gte = from;
    if (to) (q.date as Record<string, string>).$lte = to;
  }
  const expenses = await Expense.find(q).sort({ date: -1, createdAt: -1 }).lean();
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  res.json({ expenses, total });
});

router.post('/', requireAuth, requireManager, requireDb, async (req: AuthedRequest, res) => {
  const { date, category, amount, description } = req.body ?? {};
  if (!date || !category || typeof amount !== 'number') {
    return res.status(400).json({ error: 'date, category, amount required' });
  }
  const expense = await Expense.create({
    date,
    category,
    amount,
    description,
    createdBy: req.user?.userId,
  });
  res.status(201).json({ expense });
});

router.patch('/:id', requireAuth, requireManager, requireDb, async (req, res) => {
  const { date, category, amount, description } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (date !== undefined) updates.date = date;
  if (category !== undefined) updates.category = category;
  if (typeof amount === 'number') updates.amount = amount;
  if (description !== undefined) updates.description = description;
  const expense = await Expense.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!expense) return res.status(404).json({ error: 'Not found' });
  res.json({ expense });
});

router.delete('/:id', requireAuth, requireManager, requireDb, async (req, res) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
