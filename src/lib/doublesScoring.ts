/**
 * BWF doubles rally scoring engine.
 *
 * Per-team state: which player (0 or 1) is currently in the RIGHT service court.
 * The current server is determined by:
 *   - serving-team's score parity (even → right court, odd → left court)
 *   - which player occupies that court for the serving team
 *
 * On a rally:
 *   - If the SERVING team wins: they score +1, and the serving team's two players swap
 *     courts (so the same server continues serving from the other court).
 *     The receiving team does NOT swap.
 *   - If the RECEIVING team wins: they score +1 AND gain the serve. Neither team
 *     swaps courts. The new server is whichever of the new serving team is now in
 *     the court matching their (new) score parity.
 */

import type { MatchDoc, SetScore, PointLog } from '../models/Match';

export interface DoublesState {
  scoreA: number;
  scoreB: number;
  servingTeam: 'A' | 'B';
  rightCourtPlayerA: 0 | 1;
  rightCourtPlayerB: 0 | 1;
}

export function currentServerPlayerIndex(state: DoublesState): 0 | 1 {
  const score = state.servingTeam === 'A' ? state.scoreA : state.scoreB;
  const rightPlayer = state.servingTeam === 'A' ? state.rightCourtPlayerA : state.rightCourtPlayerB;
  const leftPlayer = (1 - rightPlayer) as 0 | 1;
  return score % 2 === 0 ? rightPlayer : leftPlayer;
}

/** Apply a point to the current state. Returns the new state. */
export function applyPoint(state: DoublesState, winner: 'A' | 'B'): DoublesState {
  const next: DoublesState = { ...state };
  if (winner === 'A') next.scoreA += 1;
  else next.scoreB += 1;

  if (state.servingTeam === winner) {
    // Serving team kept the serve. They swap courts; the receiver stays.
    if (winner === 'A') {
      next.rightCourtPlayerA = (1 - state.rightCourtPlayerA) as 0 | 1;
    } else {
      next.rightCourtPlayerB = (1 - state.rightCourtPlayerB) as 0 | 1;
    }
  } else {
    // Service transfers. No court swaps; new server is determined by parity on next access.
    next.servingTeam = winner;
  }
  return next;
}

export interface InitArgs {
  firstServerTeam: 'A' | 'B';
  firstServerPlayerIndex: 0 | 1;
  firstReceiverPlayerIndex: 0 | 1;
}

/** Build the opening state for a new set (score 0-0). */
export function initialState(args: InitArgs): DoublesState {
  // At 0-0 (even), server is on right court.
  // At 0-0, receiver is on diagonal right court (their team's right court).
  return {
    scoreA: 0,
    scoreB: 0,
    servingTeam: args.firstServerTeam,
    rightCourtPlayerA:
      args.firstServerTeam === 'A' ? args.firstServerPlayerIndex : args.firstReceiverPlayerIndex,
    rightCourtPlayerB:
      args.firstServerTeam === 'B' ? args.firstServerPlayerIndex : args.firstReceiverPlayerIndex,
  };
}

/** Check whether a set is won. Simple rule: first to pointsPerSet wins. */
export function isSetWon(set: SetScore, pointsPerSet: number): 'A' | 'B' | null {
  if (set.a >= pointsPerSet && set.a > set.b) return 'A';
  if (set.b >= pointsPerSet && set.b > set.a) return 'B';
  return null;
}

/** Has a team won the match? Requires majority of bestOf sets. */
export function matchWinner(sets: SetScore[], bestOf: number): 'A' | 'B' | null {
  const needed = Math.floor(bestOf / 2) + 1;
  const aWins = sets.filter((s) => s.winner === 'A').length;
  const bWins = sets.filter((s) => s.winner === 'B').length;
  if (aWins >= needed) return 'A';
  if (bWins >= needed) return 'B';
  return null;
}

/** Rebuild the live DoublesState by replaying from the current set's first point. */
export function stateFromMatch(match: MatchDoc): DoublesState | null {
  if (
    match.servingTeam == null ||
    match.rightCourtPlayerA == null ||
    match.rightCourtPlayerB == null
  ) {
    return null;
  }
  const currentSet = match.sets[match.currentSet];
  if (!currentSet) return null;
  return {
    scoreA: currentSet.a,
    scoreB: currentSet.b,
    servingTeam: match.servingTeam,
    rightCourtPlayerA: match.rightCourtPlayerA,
    rightCourtPlayerB: match.rightCourtPlayerB,
  };
}

export function formatScoreSummary(sets: SetScore[]): string {
  return sets.map((s) => `${s.a}-${s.b}`).join(', ');
}

export type { PointLog };
