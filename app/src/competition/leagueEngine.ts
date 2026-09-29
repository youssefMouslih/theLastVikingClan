// League round-robin generator (§95).
// Every player plays each other once. Circle method. No self-play, no duplicate pairs.

export interface GeneratedFixture {
  round_number: number;
  player_a_id: string;
  player_b_id: string;
}

export function generateRoundRobin(playerIds: string[]): GeneratedFixture[] {
  const players = [...playerIds];
  if (players.length < 2) return [];
  // Odd number -> add BYE (null), filtered out later
  const hasBye = players.length % 2 === 1;
  const list: (string | null)[] = hasBye ? [...players, null] : [...players];
  const n = list.length;
  const rounds = n - 1;
  const fixtures: GeneratedFixture[] = [];

  const arr = [...list];
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a && b) {
        fixtures.push({ round_number: round + 1, player_a_id: a, player_b_id: b });
      }
    }
    // rotate all but first
    arr.splice(1, 0, arr.pop() as string | null);
  }
  return fixtures;
}
