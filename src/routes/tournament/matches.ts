import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Match } from '../../models/Match';
import type { SetScore } from '../../models/Match';
import { Team } from '../../models/Team';
import { Tournament } from '../../models/Tournament';
import type { RoundFormat } from '../../models/Tournament';
import {
  requireTournamentAuth,
  requireTournamentRole,
} from '../../middleware/tournamentAuth';
import { isDbConnected } from '../../db';
import { standardSeedOrder, roundsForSize } from '../../lib/bracketSeeding';
import {
  applyPoint,
  currentServerPlayerIndex,
  initialState,
  isSetWon,
  matchWinner,
  stateFromMatch,
} from '../../lib/doublesScoring';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

const requireManager = requireTournamentRole('admin', 'super_admin');
const requireScorer = requireTournamentRole('admin', 'super_admin', 'referee');

function defaultRoundFormat(round: number, totalRounds: number): { pointsPerSet: number; bestOf: number } {
  const fromEnd = totalRounds - round;
  // Final (fromEnd 0) and Semifinal (fromEnd 1) → 21 × best of 3.
  // Everything else → 30 × 1.
  if (fromEnd <= 1) return { pointsPerSet: 21, bestOf: 3 };
  return { pointsPerSet: 30, bestOf: 1 };
}

function formatForRound(tournamentRoundFormats: RoundFormat[] | undefined, round: number, totalRounds: number) {
  const override = tournamentRoundFormats?.find((f) => f.round === round);
  if (override) return { pointsPerSet: override.pointsPerSet, bestOf: override.bestOf };
  return defaultRoundFormat(round, totalRounds);
}

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

router.get('/:id', requireDb, async (req, res) => {
  const m = await Match.findById(req.params.id)
    .populate('teamAId', 'name player1 player2 seed')
    .populate('teamBId', 'name player1 player2 seed')
    .populate('winnerId', 'name')
    .lean();
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json({ match: m });
});

router.patch('/:id', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const { scheduledAt, court, scoreA, scoreB, status, pointsPerSet, bestOf } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (court !== undefined) updates.court = court || null;
  if (typeof scoreA === 'number') updates.scoreA = scoreA;
  if (typeof scoreB === 'number') updates.scoreB = scoreB;
  if (status && ['pending', 'scheduled', 'in_progress', 'completed', 'bye'].includes(status)) {
    updates.status = status;
  }
  if (typeof pointsPerSet === 'number' && pointsPerSet > 0) updates.pointsPerSet = pointsPerSet;
  if (typeof bestOf === 'number' && [1, 3, 5].includes(bestOf)) updates.bestOf = bestOf;

  const existing = await Match.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if ((('pointsPerSet' in updates) || ('bestOf' in updates)) && existing.status === 'in_progress') {
    return res.status(409).json({ error: 'Cannot change match format after the match has started' });
  }

  const m = await Match.findByIdAndUpdate(req.params.id, updates, { new: true })
    .populate('teamAId', 'name')
    .populate('teamBId', 'name')
    .populate('winnerId', 'name');
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json({ match: m });
});

/**
 * Start a match: referee picks first server team, first server player, first receiver player.
 * Requires both teams assigned and status pending/scheduled.
 */
router.post('/:id/start', requireTournamentAuth, requireScorer, requireDb, async (req, res) => {
  const { firstServerTeam, firstServerPlayerIndex, firstReceiverPlayerIndex } = req.body ?? {};
  if (firstServerTeam !== 'A' && firstServerTeam !== 'B') {
    return res.status(400).json({ error: 'firstServerTeam must be A or B' });
  }
  if (![0, 1].includes(Number(firstServerPlayerIndex))) {
    return res.status(400).json({ error: 'firstServerPlayerIndex must be 0 or 1' });
  }
  if (![0, 1].includes(Number(firstReceiverPlayerIndex))) {
    return res.status(400).json({ error: 'firstReceiverPlayerIndex must be 0 or 1' });
  }

  const match = await Match.findById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!match.teamAId || !match.teamBId) {
    return res.status(400).json({ error: 'Both teams must be assigned' });
  }
  if (match.status !== 'pending' && match.status !== 'scheduled') {
    return res.status(409).json({ error: `Cannot start a match in status "${match.status}"` });
  }

  const state = initialState({
    firstServerTeam,
    firstServerPlayerIndex: Number(firstServerPlayerIndex) as 0 | 1,
    firstReceiverPlayerIndex: Number(firstReceiverPlayerIndex) as 0 | 1,
  });

  match.sets = [{ a: 0, b: 0 }];
  match.currentSet = 0;
  match.servingTeam = state.servingTeam;
  match.rightCourtPlayerA = state.rightCourtPlayerA;
  match.rightCourtPlayerB = state.rightCourtPlayerB;
  match.initialServingTeam = state.servingTeam;
  match.initialRightCourtPlayerA = state.rightCourtPlayerA;
  match.initialRightCourtPlayerB = state.rightCourtPlayerB;
  match.points = [];
  match.scoreA = 0;
  match.scoreB = 0;
  match.status = 'in_progress';
  match.startedAt = new Date();
  match.winnerId = undefined;
  await match.save();

  const populated = await Match.findById(match._id)
    .populate('teamAId', 'name player1 player2 seed')
    .populate('teamBId', 'name player1 player2 seed')
    .lean();
  res.json({ match: populated });
});

/** Score one point. Body: { winner: 'A' | 'B' } */
router.post('/:id/point', requireTournamentAuth, requireScorer, requireDb, async (req, res) => {
  const { winner } = req.body ?? {};
  if (winner !== 'A' && winner !== 'B') {
    return res.status(400).json({ error: 'winner must be A or B' });
  }
  const match = await Match.findById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.status !== 'in_progress') {
    return res.status(409).json({ error: 'Match is not in progress' });
  }

  const state = stateFromMatch(match);
  if (!state) return res.status(409).json({ error: 'Match state is not initialised' });

  const serverTeam = state.servingTeam;
  const serverPlayerIndex = currentServerPlayerIndex(state);
  const nextState = applyPoint(state, winner);

  // Update current set scores
  const currentSet = match.sets[match.currentSet];
  currentSet.a = nextState.scoreA;
  currentSet.b = nextState.scoreB;

  // Check if current set is won
  const setWinner = isSetWon(currentSet, match.pointsPerSet);
  if (setWinner) {
    currentSet.winner = setWinner;
  }

  match.servingTeam = nextState.servingTeam;
  match.rightCourtPlayerA = nextState.rightCourtPlayerA;
  match.rightCourtPlayerB = nextState.rightCourtPlayerB;

  match.points.push({
    set: match.currentSet,
    serverTeam,
    serverPlayerIndex,
    winner,
    scoreA: nextState.scoreA,
    scoreB: nextState.scoreB,
    at: new Date(),
  });

  // Aggregate scoreA/scoreB: use current-set score for in-progress feel
  match.scoreA = nextState.scoreA;
  match.scoreB = nextState.scoreB;

  if (setWinner) {
    const overall = matchWinner(match.sets as unknown as SetScore[], match.bestOf);
    if (overall) {
      match.status = 'completed';
      match.completedAt = new Date();
      match.winnerId = overall === 'A' ? match.teamAId : match.teamBId;
    } else {
      // Start next set. Winner of previous set serves first in the next set from their right court,
      // by whichever player the referee designated originally (we keep rightCourtPlayer as-is and
      // reset parity-based positions via fresh initial state for the new serving team).
      // Convention: in next set, the winning team's current right-court player serves first.
      const nextServingTeam = setWinner;
      const nextRightA = match.rightCourtPlayerA!;
      const nextRightB = match.rightCourtPlayerB!;
      match.sets.push({ a: 0, b: 0 });
      match.currentSet = match.sets.length - 1;
      match.servingTeam = nextServingTeam;
      match.rightCourtPlayerA = nextRightA;
      match.rightCourtPlayerB = nextRightB;
      match.scoreA = 0;
      match.scoreB = 0;
    }
  }

  await match.save();

  if (match.status === 'completed' && match.nextMatchId) {
    const update =
      match.slot === 'A' ? { teamAId: match.winnerId } : { teamBId: match.winnerId };
    await Match.findByIdAndUpdate(match.nextMatchId, update);
    await maybeAutoAdvanceBye(match.nextMatchId.toString());
  } else if (match.status === 'completed' && !match.nextMatchId) {
    await Tournament.findByIdAndUpdate(match.tournamentId, { status: 'completed' });
  }

  const populated = await Match.findById(match._id)
    .populate('teamAId', 'name player1 player2 seed')
    .populate('teamBId', 'name player1 player2 seed')
    .populate('winnerId', 'name')
    .lean();
  res.json({ match: populated });
});

/** Undo the last point by replaying from the stored initial match state. */
router.post('/:id/undo-point', requireTournamentAuth, requireScorer, requireDb, async (req, res) => {
  const match = await Match.findById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.points.length === 0) {
    return res.status(409).json({ error: 'No points to undo' });
  }
  if (
    match.initialServingTeam == null ||
    match.initialRightCourtPlayerA == null ||
    match.initialRightCourtPlayerB == null
  ) {
    return res.status(409).json({ error: 'Match has no recorded initial state' });
  }

  const log = [...match.points];
  log.pop();

  let state = {
    scoreA: 0,
    scoreB: 0,
    servingTeam: match.initialServingTeam,
    rightCourtPlayerA: match.initialRightCourtPlayerA,
    rightCourtPlayerB: match.initialRightCourtPlayerB,
  };
  const sets: SetScore[] = [{ a: 0, b: 0 }];
  let currentSetIdx = 0;

  for (const p of log) {
    state = applyPoint(state, p.winner);
    sets[currentSetIdx].a = state.scoreA;
    sets[currentSetIdx].b = state.scoreB;
    const w = isSetWon(sets[currentSetIdx], match.pointsPerSet);
    if (w) {
      sets[currentSetIdx].winner = w;
      const overall = matchWinner(sets, match.bestOf);
      if (!overall) {
        sets.push({ a: 0, b: 0 });
        currentSetIdx += 1;
        state = {
          scoreA: 0,
          scoreB: 0,
          servingTeam: w,
          rightCourtPlayerA: state.rightCourtPlayerA,
          rightCourtPlayerB: state.rightCourtPlayerB,
        };
      }
    }
  }

  match.sets = sets;
  match.currentSet = currentSetIdx;
  match.servingTeam = state.servingTeam;
  match.rightCourtPlayerA = state.rightCourtPlayerA;
  match.rightCourtPlayerB = state.rightCourtPlayerB;
  match.points = log;
  match.scoreA = state.scoreA;
  match.scoreB = state.scoreB;
  match.status = 'in_progress';
  match.winnerId = undefined;
  match.completedAt = undefined;
  await match.save();

  const populated = await Match.findById(match._id)
    .populate('teamAId', 'name player1 player2 seed')
    .populate('teamBId', 'name player1 player2 seed')
    .lean();
  res.json({ match: populated });
});

/**
 * Clear a manually-picked winner: resets the match to pending, removes the winner slot
 * from the next match. Refuses if the next match has itself been completed or if live
 * scoring has been recorded (use /undo-point for that case).
 */
router.post('/:id/clear-winner', requireTournamentAuth, requireManager, requireDb, async (req, res) => {
  const match = await Match.findById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!match.winnerId) return res.status(409).json({ error: 'Match has no winner to clear' });
  if (match.status === 'bye') return res.status(409).json({ error: 'Cannot clear a bye' });
  if ((match.points?.length ?? 0) > 0) {
    return res.status(409).json({
      error: 'Match has scored points — use undo from the scorer to roll back point-by-point',
    });
  }

  if (match.nextMatchId) {
    const next = await Match.findById(match.nextMatchId);
    if (next?.winnerId || (next?.points?.length ?? 0) > 0) {
      return res.status(409).json({
        error: 'The follow-up match has already been played or started. Clear that first.',
      });
    }
    const unset = match.slot === 'A' ? { teamAId: 1 } : { teamBId: 1 };
    await Match.findByIdAndUpdate(match.nextMatchId, { $unset: unset });
  }

  match.winnerId = undefined;
  match.status = match.teamAId && match.teamBId ? 'pending' : 'bye';
  match.scoreA = undefined;
  match.scoreB = undefined;
  match.sets = [];
  match.currentSet = 0;
  match.servingTeam = undefined;
  match.rightCourtPlayerA = undefined;
  match.rightCourtPlayerB = undefined;
  match.initialServingTeam = undefined;
  match.initialRightCourtPlayerA = undefined;
  match.initialRightCourtPlayerB = undefined;
  match.startedAt = undefined;
  match.completedAt = undefined;
  await match.save();

  // If clearing a final match, revert tournament status back from completed
  if (!match.nextMatchId) {
    const t = await Tournament.findById(match.tournamentId);
    if (t && t.status === 'completed') {
      t.status = 'in_progress';
      await t.save();
    }
  }

  const populated = await Match.findById(match._id)
    .populate('teamAId', 'name')
    .populate('teamBId', 'name')
    .lean();
  res.json({ match: populated });
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
    const round1Format = formatForRound(tournament.roundFormats, 1, rounds);
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
        pointsPerSet: round1Format.pointsPerSet,
        bestOf: round1Format.bestOf,
      });
    }
    const round1 = await Match.insertMany(round1Docs);
    matchesByRound.push(round1.map((m) => m._id as Types.ObjectId));

    // Create subsequent rounds as empty matches
    for (let r = 2; r <= rounds; r++) {
      const count = size / Math.pow(2, r);
      const fmt = formatForRound(tournament.roundFormats, r, rounds);
      const docs = [];
      for (let i = 0; i < count; i++) {
        docs.push({
          tournamentId: tournament._id,
          round: r,
          position: i,
          slot: i % 2 === 0 ? 'A' : 'B',
          status: 'pending' as const,
          pointsPerSet: fmt.pointsPerSet,
          bestOf: fmt.bestOf,
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
