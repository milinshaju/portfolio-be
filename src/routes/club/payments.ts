import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Payment } from '../../models/Payment';
import { Player } from '../../models/Player';
import { getSettings } from '../../models/Settings';
import { requireAuth, requireRole, type AuthedRequest } from '../../middleware/auth';
import { isDbConnected } from '../../db';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

const requireManager = requireRole('admin', 'super_admin');

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/', requireAuth, requireDb, async (req, res) => {
  const month = String(req.query.month || currentMonth());
  const settings = await getSettings();

  const players = await Player.find({ isActive: true }).sort({ name: 1 }).lean();
  const existing = await Payment.find({ month }).lean();
  const byPlayer = new Map(existing.map((p) => [String(p.playerId), p]));

  const rows = players.map((pl) => {
    const p = byPlayer.get(String(pl._id));
    const defaultAmount = pl.monthlyDues ?? settings.defaultMonthlyDues;
    return {
      playerId: String(pl._id),
      playerName: pl.name,
      phone: pl.phone,
      month,
      amount: p?.amount ?? defaultAmount,
      paid: p?.paid ?? false,
      paidAt: p?.paidAt,
      paymentId: p ? String(p._id) : null,
      notes: p?.notes,
    };
  });

  const totalCollected = rows
    .filter((r) => r.paid)
    .reduce((sum, r) => sum + r.amount, 0);
  const totalOutstanding = rows
    .filter((r) => !r.paid)
    .reduce((sum, r) => sum + r.amount, 0);

  res.json({
    month,
    rows,
    summary: {
      total: rows.length,
      paidCount: rows.filter((r) => r.paid).length,
      unpaidCount: rows.filter((r) => !r.paid).length,
      totalCollected,
      totalOutstanding,
      defaultAmount: settings.defaultMonthlyDues,
    },
  });
});

router.post('/', requireAuth, requireManager, requireDb, async (req: AuthedRequest, res) => {
  const { playerId, month, amount, paid, notes } = req.body ?? {};
  if (!playerId || !month) {
    return res.status(400).json({ error: 'playerId and month required' });
  }
  const settings = await getSettings();
  const player = await Player.findById(playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const finalAmount =
    typeof amount === 'number'
      ? amount
      : player.monthlyDues ?? settings.defaultMonthlyDues;
  const isPaid = Boolean(paid);

  const payment = await Payment.findOneAndUpdate(
    { playerId, month },
    {
      $set: {
        amount: finalAmount,
        paid: isPaid,
        paidAt: isPaid ? new Date() : null,
        notes,
        recordedBy: req.user?.userId,
      },
    },
    { new: true, upsert: true }
  );
  res.json({ payment });
});

router.get('/player/:id/history', requireAuth, requireDb, async (req, res) => {
  const player = await Player.findById(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const records = await Payment.find({ playerId: player._id })
    .sort({ month: -1 })
    .lean();

  const settings = await getSettings();
  const defaultAmount = player.monthlyDues ?? settings.defaultMonthlyDues;

  const paidTotal = records
    .filter((r) => r.paid)
    .reduce((sum, r) => sum + r.amount, 0);
  const paidCount = records.filter((r) => r.paid).length;

  res.json({
    player: {
      id: String(player._id),
      name: player.name,
      phone: player.phone,
      email: player.email,
      joinedAt: player.joinedAt,
      monthlyDues: player.monthlyDues,
      defaultAmount,
    },
    history: records.map((r) => ({
      _id: String(r._id),
      month: r.month,
      amount: r.amount,
      paid: r.paid,
      paidAt: r.paidAt,
      notes: r.notes,
    })),
    summary: {
      paidCount,
      paidTotal,
      recordCount: records.length,
    },
  });
});

router.post('/bulk', requireAuth, requireManager, requireDb, async (req: AuthedRequest, res) => {
  const { month, playerIds, paid } = req.body ?? {};
  if (!month || !Array.isArray(playerIds) || playerIds.length === 0 || typeof paid !== 'boolean') {
    return res.status(400).json({ error: 'month, playerIds[], paid required' });
  }
  const settings = await getSettings();
  const players = await Player.find({ _id: { $in: playerIds } }).lean();
  const byId = new Map(players.map((p) => [String(p._id), p]));

  const ops = playerIds.map((playerId) => {
    const pl = byId.get(String(playerId));
    const defaultAmount = pl?.monthlyDues ?? settings.defaultMonthlyDues;
    const $set: Record<string, unknown> = {
      paid,
      recordedBy: req.user?.userId,
    };
    if (paid) $set.paidAt = new Date();
    const update: Record<string, unknown> = {
      $set,
      $setOnInsert: { amount: defaultAmount },
    };
    if (!paid) update.$unset = { paidAt: '' };
    return {
      updateOne: {
        filter: { playerId, month },
        update,
        upsert: true,
      },
    };
  });

  const result = await Payment.bulkWrite(ops);
  res.json({ ok: true, matched: result.matchedCount, upserted: result.upsertedCount });
});

router.patch('/:id', requireAuth, requireManager, requireDb, async (req, res) => {
  const { amount, paid, notes } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (typeof amount === 'number') updates.amount = amount;
  if (typeof paid === 'boolean') {
    updates.paid = paid;
    updates.paidAt = paid ? new Date() : null;
  }
  if (notes !== undefined) updates.notes = notes;
  const payment = await Payment.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!payment) return res.status(404).json({ error: 'Not found' });
  res.json({ payment });
});

export default router;
