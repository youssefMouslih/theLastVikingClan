export type PenaltyValidationError = 'team' | 'points' | 'reason';

export function validatePenaltyInput(input: {
  teamId: string;
  points: number;
  reason: string;
}): PenaltyValidationError | null {
  if (!input.teamId) return 'team';
  if (
    !Number.isInteger(input.points)
    || input.points === 0
    || input.points < -100
    || input.points > 100
  ) {
    return 'points';
  }
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 1000) return 'reason';
  return null;
}

export function validTiebreakReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= 3 && trimmed.length <= 1000;
}

export function moveTeam(teamIds: string[], from: number, direction: -1 | 1): string[] {
  const to = from + direction;
  if (from < 0 || from >= teamIds.length || to < 0 || to >= teamIds.length) return teamIds;
  const next = [...teamIds];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function resolveTiebreakOrder(saved: string[], approved: string[]): string[] {
  const allowed = new Set(approved);
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of saved) {
    if (allowed.has(id) && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of approved) {
    if (!seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  return order;
}

export function formatDiff(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
