import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Match } from '../../models/Match';
import { Team } from '../../models/Team';
import { Tournament } from '../../models/Tournament';
import {
  requireTournamentAuth,
  requireTournamentRole,
} from '../../middleware/tournamentAuth';
import { isDbConnected } from '../../db';
import { standardSeedOrder, roundsForSize } from '../../lib/bracketSeeding';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

const requireManager = requireTournamentRole('admin', 'super_admin');

router.get('/', requireDb, async (req, res) => {
  const tournamentId = String(req.query.tournamentId || '');
  if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
  const matches = await Match.find({ tournamentId })
    .sort({ round: 1, position: 1 })
    .populate('teamAId', 'name player1 player2 seed')
    .populate('teamBId', 'name player1 player2 seed')
    .populate('winnerId', 'name')
    .lean();
  res.json({ matches });
});

router.get('/schedule', requireDb, async (req, res) => {
  const tournamentId = String(req.query.tournamentId || '');
  if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
  const matches = await Match.find({ tournamentId, scheduledAt: { $ne: null } })
    .sort({ scheduledAt: 1 })
    .populate('teamAId', 'name player1 player2')
    .populate('teamBId', 'name player1 player2')
    .populate('winnerId', 'name')
    .lean();
  res.json({ matches });
});

router.patch('/:id', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const { scheduledAt, court, scoreA, scoreB, status } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (court !== undefined) updates.court = court || null;
  if (typeof scoreA === 'number') updates.scoreA = scoreA;
  if (typeof scoreB === 'number') updates.scoreB = scoreB;
  if (status && ['pending', 'scheduled', 'in_progress', 'completed', 'bye'].includes(status)) {
    updates.status = status;
  }
  const m = await Match.findByIdAndUpdate(req.params.id, updates, { new: true })
    .populate('teamAId', 'name')
    .populate('teamBId', 'name')
    .populate('winnerId', 'name');
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json({ match: m });
});

router.post('/:id/winner', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const { winnerId } = req.body ?? {};
  if (!winnerId) return res.status(400).json({ error: 'winnerId required' });

  const match = await Match.findById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const winnerObjectId = new Types.ObjectId(String(winnerId));
  const validWinner =
    (match.teamAId && match.teamAId.equals(winnerObjectId)) ||
    (match.teamBId && match.teamBId.equals(winnerObjectId));
  if (!validWinner) {
    return res.status(400).json({ error: 'Winner must be one of the match teams' });
  }

  match.winnerId = winnerObjectId;
  match.status = 'completed';
  await match.save();

  if (match.nextMatchId) {
    const update = match.slot === 'A' ? { teamAId: winnerObjectId } : { teamBId: winnerObjectId };
    const nextMatch = await Match.findByIdAndUpdate(match.nextMatchId, update, { new: true });
    if (nextMatch && nextMatch.teamAId && nextMatch.teamBId && nextMatch.status === 'pending') {
      // Keep pending (ready to play) unless it was a bye earlier
    }
    // Bye auto-advance: if the next match only has one team populated and the other is a bye, auto-complete
    if (nextMatch) {
      await maybeAutoAdvanceBye(nextMatch._id.toString());
    }
  } else {
    // Final match — tournament is complete
    await Tournament.findByIdAndUpdate(match.tournamentId, { status: 'completed' });
  }

  res.json({ match });
});

async function maybeAutoAdvanceBye(matchId: string) {
  const m = await Match.findById(matchId);
  if (!m || m.status !== 'bye') return;
  if (m.teamAId && !m.teamBId && !m.winnerId) {
    m.winnerId = m.teamAId;
    m.status = 'completed';
    await m.save();
    if (m.nextMatchId) {
      const update = m.slot === 'A' ? { teamAId: m.winnerId } : { teamBId: m.winnerId };
      await Match.findByIdAndUpdate(m.nextMatchId, update);
      await maybeAutoAdvanceBye(m.nextMatchId.toString());
    }
  }
}

router.post(
  '/bracket/generate',
  requireTournamentAuth,
  requireManager,
  requireDb,
  async (req, res) => {
    const { tournamentId, mode = 'seeded' } = req.body ?? {};
    if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
    if (!['seeded', 'random'].includes(String(mode))) {
      return res.status(400).json({ error: 'mode must be seeded or random' });
    }

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const size = tournament.size;
    const allTeams = await Team.find({ tournamentId }).lean();

    if (allTeams.length === 0) {
      return res.status(400).json({ error: 'Add teams before generating the bracket' });
    }

    await Match.deleteMany({ tournamentId });

    // Assign position -> team.
    // In seeded mode: use each team's seed (1..size) and place via standardSeedOrder.
    // In random mode: shuffle teams and place them in bracket positions 0..size-1.
    const positionToTeam: (string | null)[] = new Array(size).fill(null);

    if (mode === 'seeded') {
      const bySeed = new Map<number, string>();
      for (const t of allTeams) {
        if (t.seed != null) bySeed.set(t.seed, String(t._id));
      }
      const order = standardSeedOrder(size); // array of seed numbers in bracket position order
      const unseededTeams = allTeams.filter((t) => t.seed == null).map((t) => String(t._id));
      let unseededIdx = 0;
      order.forEach((seedNum, posIdx) => {
        const teamId = bySeed.get(seedNum);
        if (teamId) {
          positionToTeam[posIdx] = teamId;
        } else if (unseededIdx < unseededTeams.length) {
          positionToTeam[posIdx] = unseededTeams[unseededIdx++];
        }
      });
    } else {
      const shuffled = [...allTeams]
        .map((t) => ({ id: String(t._id), k: Math.random() }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.id);
      for (let i = 0; i < Math.min(size, shuffled.length); i++) {
        positionToTeam[i] = shuffled[i];
      }
    }

    // Create round 1 matches
    const rounds = roundsForSize(size);
    const matchesByRound: Types.ObjectId[][] = [];

    const round1Count = size / 2;
    const round1Docs = [];
    for (let i = 0; i < round1Count; i++) {
      const aTeam = positionToTeam[i * 2];
      const bTeam = positionToTeam[i * 2 + 1];
      const isBye = (aTeam || bTeam) && !(aTeam && bTeam);
      round1Docs.push({
        tournamentId: tournament._id,
        round: 1,
        position: i,
        teamAId: aTeam ? new Types.ObjectId(aTeam) : undefined,
        teamBId: bTeam ? new Types.ObjectId(bTeam) : undefined,
        slot: i % 2 === 0 ? 'A' : 'B',
        status: isBye ? 'bye' : aTeam && bTeam ? 'pending' : 'bye',
      });
    }
    const round1 = await Match.insertMany(round1Docs);
    matchesByRound.push(round1.map((m) => m._id as Types.ObjectId));

    // Create subsequent rounds as empty matches
    for (let r = 2; r <= rounds; r++) {
      const count = size / Math.pow(2, r);
      const docs = [];
      for (let i = 0; i < count; i++) {
        docs.push({
          tournamentId: tournament._id,
          round: r,
          position: i,
          slot: i % 2 === 0 ? 'A' : 'B',
          status: 'pending' as const,
        });
      }
      const inserted = await Match.insertMany(docs);
      matchesByRound.push(inserted.map((m) => m._id as Types.ObjectId));
    }

    // Link each match's nextMatchId to the match in the next round at position floor(i/2)
    for (let r = 0; r < rounds - 1; r++) {
      const thisRound = matchesByRound[r];
      const nextRound = matchesByRound[r + 1];
      for (let i = 0; i < thisRound.length; i++) {
        await Match.findByIdAndUpdate(thisRound[i], {
          nextMatchId: nextRound[Math.floor(i / 2)],
          slot: i % 2 === 0 ? 'A' : 'B',
        });
      }
    }

    // Auto-advance byes
    for (const id of matchesByRound[0]) {
      await maybeAutoAdvanceBye(id.toString());
    }

    // Set tournament status to published if it was draft
    if (tournament.status === 'draft') {
      tournament.status = 'published';
      await tournament.save();
    }

    const allMatches = await Match.find({ tournamentId: tournament._id })
      .sort({ round: 1, position: 1 })
      .populate('teamAId', 'name seed')
      .populate('teamBId', 'name seed')
      .populate('winnerId', 'name');
    res.json({ matches: allMatches });
  }
);

router.delete(
  '/bracket',
  requireTournamentAuth,
  requireManager,
  requireDb,
  async (req, res) => {
    const { tournamentId } = req.body ?? {};
    if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
    const result = await Match.deleteMany({ tournamentId });
    res.json({ ok: true, deleted: result.deletedCount });
  }
);

router.post('/:id/swap', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const { otherId } = req.body ?? {};
  if (!otherId) return res.status(400).json({ error: 'otherId required' });
  const [m1, m2] = await Promise.all([
    Match.findById(req.params.id),
    Match.findById(otherId),
  ]);
  if (!m1 || !m2) return res.status(404).json({ error: 'Match not found' });
  if (m1.round !== 1 || m2.round !== 1) {
    return res.status(400).json({ error: 'Can only swap teams in round 1 before play starts' });
  }
  if (!m1.tournamentId.equals(m2.tournamentId)) {
    return res.status(400).json({ error: 'Matches belong to different tournaments' });
  }
  if (m1.winnerId || m2.winnerId) {
    return res.status(400).json({ error: 'Cannot swap after a match has a winner' });
  }
  // Swap one side: allow specifying which slot to swap
  const { slotFrom = 'A', slotTo = 'A' } = req.body ?? {};
  const aField = slotFrom === 'A' ? 'teamAId' : 'teamBId';
  const bField = slotTo === 'A' ? 'teamAId' : 'teamBId';
  const tmp = m1[aField as 'teamAId'];
  m1[aField as 'teamAId'] = m2[bField as 'teamAId'];
  m2[bField as 'teamAId'] = tmp;

  // Recompute bye status
  m1.status = !m1.teamAId && !m1.teamBId
    ? 'bye'
    : (m1.teamAId && m1.teamBId) ? 'pending' : 'bye';
  m2.status = !m2.teamAId && !m2.teamBId
    ? 'bye'
    : (m2.teamAId && m2.teamBId) ? 'pending' : 'bye';

  await m1.save();
  await m2.save();

  res.json({ ok: true });
});

export default router;
