// Knockout bracket generator (§96, §55).
// V1 supports 4 / 8 / 16. Seeded in registration order.

export interface BracketMatch {
  round_name: string;
  round_number: number;
  player_a_id: string | null; // null = TBD (winner of previous)
  player_b_id: string | null;
}

export function roundNameForSize(size: number, roundNumber: number): string {
  const totalRounds = Math.log2(size);
  const fromEnd = totalRounds - roundNumber;
  if (fromEnd === 0) return 'FINAL';
  if (fromEnd === 1) return 'SEMI FINAL';
  if (fromEnd === 2) return 'QUARTER FINAL';
  return `ROUND OF ${size >> (roundNumber - 1)}`;
}

export function generateKnockout(participantIds: string[]): BracketMatch[] {
  const size = participantIds.length;
  if (![4, 8, 16].includes(size)) {
    throw new Error(`V1 supports bracket sizes 4/8/16, got ${size}`);
  }
  const bracket: BracketMatch[] = [];
  const totalRounds = Math.log2(size);
  // Round 1: actual participants
  for (let i = 0; i < size / 2; i++) {
    bracket.push({
      round_name: roundNameForSize(size, 1),
      round_number: 1,
      player_a_id: participantIds[i * 2],
      player_b_id: participantIds[i * 2 + 1],
    });
  }
  // Later rounds: TBD slots
  let matchesInRound = size / 4;
  for (let r = 2; r <= totalRounds; r++) {
    for (let i = 0; i < matchesInRound; i++) {
      bracket.push({
        round_name: roundNameForSize(size, r),
        round_number: r,
        player_a_id: null,
        player_b_id: null,
      });
    }
    matchesInRound /= 2;
  }
  return bracket;
}
