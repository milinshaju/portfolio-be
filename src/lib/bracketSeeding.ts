/**
 * Standard single-elimination seed bracket ordering.
 * Returns an array of seed numbers (1..n) in the order they should
 * appear as positions in the bracket, so adjacent pairs are round-1 matches.
 *
 * For n=8: [1, 8, 4, 5, 2, 7, 3, 6]
 * For n=16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
 *
 * Property: seeds 1 and 2 land in opposite halves, 1 vs n and 2 vs n-1
 * in round 1, and top seeds only meet in the final round if they all win.
 */
export function standardSeedOrder(n: number): number[] {
  let list = [1];
  while (list.length < n) {
    const m = list.length * 2 + 1;
    const next: number[] = [];
    for (const s of list) {
      next.push(s);
      next.push(m - s);
    }
    list = next;
  }
  return list;
}

export function roundsForSize(size: number): number {
  return Math.log2(size);
}

export function matchesInRound(size: number, round: number): number {
  return size / Math.pow(2, round);
}
