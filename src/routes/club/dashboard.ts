import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Payment } from '../../models/Payment';
import { Expense } from '../../models/Expense';
import { Slot, DEFAULT_SLOTS } from '../../models/Slot';
import { Member } from '../../models/Member';
import { Player } from '../../models/Player';
import { getSettings } from '../../models/Settings';
import { requireAuth } from '../../middleware/auth';
import { isDbConnected } from '../../db';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function ensureSlots() {
  const count = await Slot.countDocuments();
  if (count === 0) await Slot.insertMany(DEFAULT_SLOTS);
}

router.get('/', requireAuth, requireDb, async (_req, res) => {
  await ensureSlots();
  const month = currentMonth();

  const [
    memberCount,
    playerCount,
    settings,
    paidAgg,
    unpaidAgg,
    lifetimeCollectedAgg,
    lifetimeExpensesAgg,
    slots,
    currentMonthExpensesAgg,
  ] = await Promise.all([
    Member.countDocuments({ isActive: true }),
    Player.countDocuments({ isActive: true }),
    getSettings(),
    Payment.aggregate([
      { $match: { month, paid: true } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { month, paid: false } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { paid: true } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Slot.find().sort({ startHour: 1 }).populate('playerIds', 'name').lean(),
    Expense.aggregate([
      { $match: { date: { $regex: `^${month}` } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const thisMonthCollected = paidAgg[0]?.total ?? 0;
  const lifetimeCollected = lifetimeCollectedAgg[0]?.total ?? 0;
  const lifetimeExpenses = lifetimeExpensesAgg[0]?.total ?? 0;
  const cashInHand = lifetimeCollected - lifetimeExpenses;

  const paidRecordCount = paidAgg[0]?.count ?? 0;
  const unpaidRecordCount = unpaidAgg[0]?.count ?? 0;
  const unrecordedCount = Math.max(0, playerCount - (paidRecordCount + unpaidRecordCount));
  const totalDuesExpected = playerCount * settings.defaultMonthlyDues;

  res.json({
    month,
    currency: settings.currency,
    cashInHand,
    lifetime: {
      collected: lifetimeCollected,
      expenses: lifetimeExpenses,
    },
    thisMonth: {
      expected: totalDuesExpected,
      collected: thisMonthCollected,
      outstanding: (unpaidAgg[0]?.total ?? 0) + unrecordedCount * settings.defaultMonthlyDues,
      paidCount: paidRecordCount,
      unpaidCount: unpaidRecordCount + unrecordedCount,
      expenses: currentMonthExpensesAgg[0]?.total ?? 0,
    },
    memberCount,
    playerCount,
    slots,
  });
});

export default router;
