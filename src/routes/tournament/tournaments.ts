import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Tournament } from '../../models/Tournament';
import { Team } from '../../models/Team';
import { Match } from '../../models/Match';
import { requireTournamentAuth, requireTournamentRole } from '../../middleware/tournamentAuth';
import { isDbConnected } from '../../db';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

const requireManager = requireTournamentRole('admin', 'super_admin');

router.get('/active', requireDb, async (_req, res) => {
  const tournament = await Tournament.findOne({ isActive: true }).lean();
  if (!tournament) return res.json({ tournament: null });
  const [teamCount, matchCount] = await Promise.all([
    Team.countDocuments({ tournamentId: tournament._id }),
    Match.countDocuments({ tournamentId: tournament._id }),
  ]);
  res.json({ tournament: { ...tournament, teamCount, matchCount } });
});

router.get('/', requireDb, async (_req, res) => {
  const tournaments = await Tournament.find().sort({ createdAt: -1 }).lean();
  res.json({ tournaments });
});

router.get('/:id', requireDb, async (req, res) => {
  const t = await Tournament.findById(req.params.id).lean();
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ tournament: t });
});

router.post('/', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const body = req.body ?? {};
  const {
    name,
    description,
    startDate,
    endDate,
    venueName,
    venueAddress,
    venueCity,
    venueMapQuery,
    organizers,
    size,
    status,
    entryFee,
    prize,
    rules,
    isActive,
  } = body;

  if (!name) return res.status(400).json({ error: 'name required' });
  if (![8, 16, 32, 64].includes(Number(size))) {
    return res.status(400).json({ error: 'size must be 8, 16, 32, or 64' });
  }

  if (isActive) {
    await Tournament.updateMany({ isActive: true }, { $set: { isActive: false } });
  }

  const tournament = await Tournament.create({
    name,
    description,
    startDate,
    endDate,
    venueName,
    venueAddress,
    venueCity,
    venueMapQuery,
    organizers: Array.isArray(organizers) ? organizers : [],
    size: Number(size),
    status: status || 'draft',
    entryFee,
    prize,
    rules,
    isActive: Boolean(isActive),
  });
  res.status(201).json({ tournament });
});

router.patch('/:id', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const allowed = [
    'name',
    'description',
    'startDate',
    'endDate',
    'venueName',
    'venueAddress',
    'venueCity',
    'venueMapQuery',
    'organizers',
    'status',
    'entryFee',
    'prize',
    'rules',
  ] as const;
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (req.body && k in req.body) updates[k] = req.body[k];
  }

  if ('isActive' in (req.body ?? {})) {
    if (req.body.isActive) {
      await Tournament.updateMany(
        { isActive: true, _id: { $ne: req.params.id } },
        { $set: { isActive: false } }
      );
    }
    updates.isActive = Boolean(req.body.isActive);
  }

  if ('size' in (req.body ?? {})) {
    const size = Number(req.body.size);
    if (![8, 16, 32, 64].includes(size)) {
      return res.status(400).json({ error: 'Invalid size' });
    }
    // Changing size invalidates the bracket — refuse if matches exist
    const matchCount = await Match.countDocuments({ tournamentId: req.params.id });
    if (matchCount > 0) {
      return res.status(409).json({
        error: 'Cannot change size after bracket has been generated. Clear the bracket first.',
      });
    }
    updates.size = size;
  }

  const t = await Tournament.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ tournament: t });
});

router.delete('/:id', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const t = await Tournament.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  await Promise.all([
    Team.deleteMany({ tournamentId: t._id }),
    Match.deleteMany({ tournamentId: t._id }),
    Tournament.deleteOne({ _id: t._id }),
  ]);
  res.json({ ok: true });
});

export default router;
