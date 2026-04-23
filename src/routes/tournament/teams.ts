import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Team } from '../../models/Team';
import { Tournament } from '../../models/Tournament';
import { requireTournamentAuth, requireTournamentRole } from '../../middleware/tournamentAuth';
import { isDbConnected } from '../../db';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

const requireManager = requireTournamentRole('admin', 'super_admin');

router.get('/', requireDb, async (req, res) => {
  const tournamentId = String(req.query.tournamentId || '');
  if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
  const teams = await Team.find({ tournamentId }).sort({ seed: 1, createdAt: 1 }).lean();
  res.json({ teams });
});

router.post('/register', requireDb, async (req, res) => {
  const { tournamentId, name, player1, player2, phone, email, notes } = req.body ?? {};
  if (!tournamentId || !name || !player1 || !player2) {
    return res.status(400).json({ error: 'tournamentId, name, player1, player2 required' });
  }
  const t = await Tournament.findById(tournamentId);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (!t.publicRegistrationOpen) {
    return res.status(403).json({ error: 'Public registration is not open for this tournament' });
  }
  if (t.status === 'in_progress' || t.status === 'completed') {
    return res.status(409).json({ error: 'Registration closed — tournament already started' });
  }

  const count = await Team.countDocuments({ tournamentId });
  if (count >= t.size) {
    return res.status(409).json({ error: `Tournament is full (${t.size} teams max)` });
  }

  const dupe = await Team.findOne({
    tournamentId,
    name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (dupe) return res.status(409).json({ error: 'A team with that name is already registered' });

  const team = await Team.create({
    tournamentId,
    name: String(name).trim(),
    player1: String(player1).trim(),
    player2: String(player2).trim(),
    phone: phone ? String(phone).trim() : undefined,
    email: email ? String(email).trim() : undefined,
    notes: notes ? String(notes).trim() : undefined,
  });
  res.status(201).json({ team: { _id: team._id, name: team.name } });
});

router.post('/', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const { tournamentId, name, player1, player2, phone, email, seed, notes } = req.body ?? {};
  if (!tournamentId || !name || !player1 || !player2) {
    return res.status(400).json({ error: 'tournamentId, name, player1, player2 required' });
  }
  const t = await Tournament.findById(tournamentId);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });

  const count = await Team.countDocuments({ tournamentId });
  if (count >= t.size) {
    return res.status(409).json({ error: `Tournament is full (${t.size} teams max)` });
  }

  if (seed != null) {
    const existingSeed = await Team.findOne({ tournamentId, seed: Number(seed) });
    if (existingSeed) {
      return res.status(409).json({ error: `Seed ${seed} already used` });
    }
  }

  const team = await Team.create({
    tournamentId,
    name,
    player1,
    player2,
    phone,
    email,
    seed: seed != null ? Number(seed) : undefined,
    notes,
  });
  res.status(201).json({ team });
});

router.patch('/:id', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const allowed = ['name', 'player1', 'player2', 'phone', 'email', 'seed', 'notes'] as const;
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (req.body && k in req.body) updates[k] = req.body[k];
  }
  if ('seed' in updates) {
    const seed = updates.seed == null ? null : Number(updates.seed);
    const existing = await Team.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (seed != null) {
      const other = await Team.findOne({
        tournamentId: existing.tournamentId,
        seed,
        _id: { $ne: existing._id },
      });
      if (other) return res.status(409).json({ error: `Seed ${seed} already used` });
    }
    updates.seed = seed ?? undefined;
  }
  const t = await Team.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ team: t });
});

router.delete('/:id', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const t = await Team.findByIdAndDelete(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
