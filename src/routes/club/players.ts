import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Player } from '../../models/Player';
import { Slot } from '../../models/Slot';
import { Payment } from '../../models/Payment';
import { requireAuth, requireRole } from '../../middleware/auth';
import { isDbConnected } from '../../db';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

const requireManager = requireRole('admin', 'super_admin');

router.get('/', requireAuth, requireDb, async (_req, res) => {
  const players = await Player.find({ isActive: true }).sort({ name: 1 }).lean();
  const slots = await Slot.find({ playerIds: { $in: players.map((p) => p._id) } })
    .select('startHour endHour playerIds')
    .lean();

  const slotsByPlayer = new Map<string, { _id: string; startHour: number; endHour: number }[]>();
  for (const s of slots) {
    for (const pid of s.playerIds) {
      const key = String(pid);
      const arr = slotsByPlayer.get(key) ?? [];
      arr.push({ _id: String(s._id), startHour: s.startHour, endHour: s.endHour });
      slotsByPlayer.set(key, arr);
    }
  }

  const enriched = players.map((p) => ({
    ...p,
    slots: (slotsByPlayer.get(String(p._id)) ?? []).sort((a, b) => a.startHour - b.startHour),
  }));

  res.json({ players: enriched });
});

router.post('/', requireAuth, requireManager, requireDb, async (req, res) => {
  const { name, phone, email, monthlyDues, joinedAt, notes, slotIds } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const player = await Player.create({
    name,
    phone,
    email,
    monthlyDues: typeof monthlyDues === 'number' ? monthlyDues : undefined,
    joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
    notes,
  });

  if (Array.isArray(slotIds) && slotIds.length > 0) {
    await Slot.updateMany(
      { _id: { $in: slotIds } },
      { $addToSet: { playerIds: player._id } }
    );
  }

  res.status(201).json({ player });
});

router.patch('/:id', requireAuth, requireManager, requireDb, async (req, res) => {
  const { name, phone, email, monthlyDues, notes, isActive } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (monthlyDues !== undefined) updates.monthlyDues = monthlyDues;
  if (notes !== undefined) updates.notes = notes;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  const player = await Player.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!player) return res.status(404).json({ error: 'Not found' });
  res.json({ player });
});

router.delete('/:id', requireAuth, requireManager, requireDb, async (req, res) => {
  const player = await Player.findById(req.params.id);
  if (!player) return res.status(404).json({ error: 'Not found' });
  // remove from all slots + keep payments for history
  await Slot.updateMany({ playerIds: player._id }, { $pull: { playerIds: player._id } });
  player.isActive = false;
  await player.save();
  res.json({ ok: true });
});

router.post('/:id/slots', requireAuth, requireManager, requireDb, async (req, res) => {
  const { slotIds } = req.body ?? {};
  if (!Array.isArray(slotIds)) return res.status(400).json({ error: 'slotIds array required' });
  const player = await Player.findById(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  await Slot.updateMany({ playerIds: player._id }, { $pull: { playerIds: player._id } });
  if (slotIds.length > 0) {
    await Slot.updateMany({ _id: { $in: slotIds } }, { $addToSet: { playerIds: player._id } });
  }
  res.json({ ok: true });
});

router.post('/:id/move', requireAuth, requireManager, requireDb, async (req, res) => {
  const { fromSlotId, toSlotId } = req.body ?? {};
  if (!toSlotId) return res.status(400).json({ error: 'toSlotId required' });
  const player = await Player.findById(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  if (fromSlotId) {
    await Slot.updateOne({ _id: fromSlotId }, { $pull: { playerIds: player._id } });
  }
  await Slot.updateOne({ _id: toSlotId }, { $addToSet: { playerIds: player._id } });
  res.json({ ok: true });
});

export default router;
