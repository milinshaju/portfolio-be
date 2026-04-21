import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Slot, DEFAULT_SLOTS } from '../../models/Slot';
import { requireAuth, requireRole } from '../../middleware/auth';
import { isDbConnected } from '../../db';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

const requireManager = requireRole('admin', 'super_admin');

async function ensureDefaults() {
  const count = await Slot.countDocuments();
  if (count > 0) return;
  await Slot.insertMany(DEFAULT_SLOTS);
}

router.get('/', requireAuth, requireDb, async (_req, res) => {
  await ensureDefaults();
  const slots = await Slot.find()
    .sort({ startHour: 1 })
    .populate('playerIds', 'name phone')
    .lean();
  res.json({ slots });
});

router.patch('/:id', requireAuth, requireManager, requireDb, async (req, res) => {
  const { playerIds, notes } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (Array.isArray(playerIds)) updates.playerIds = playerIds;
  if (notes !== undefined) updates.notes = notes;
  const slot = await Slot.findByIdAndUpdate(req.params.id, updates, { new: true }).populate(
    'playerIds',
    'name phone'
  );
  if (!slot) return res.status(404).json({ error: 'Not found' });
  res.json({ slot });
});

router.post('/:id/players', requireAuth, requireManager, requireDb, async (req, res) => {
  const { playerId } = req.body ?? {};
  if (!playerId) return res.status(400).json({ error: 'playerId required' });
  const slot = await Slot.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { playerIds: playerId } },
    { new: true }
  ).populate('playerIds', 'name phone');
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  res.json({ slot });
});

router.delete('/:id/players/:playerId', requireAuth, requireManager, requireDb, async (req, res) => {
  const slot = await Slot.findByIdAndUpdate(
    req.params.id,
    { $pull: { playerIds: req.params.playerId } },
    { new: true }
  ).populate('playerIds', 'name phone');
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  res.json({ slot });
});

export default router;
