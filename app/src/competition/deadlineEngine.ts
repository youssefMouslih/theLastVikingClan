// Deadline engine (§99). Pure date comparisons — server time is authoritative,
// client countdowns are informational only (§35, Rule 14/15).

export function isPastDeadline(deadlineIso: string | null, nowMs = Date.now()): boolean {
  if (!deadlineIso) return false;
  return nowMs > new Date(deadlineIso).getTime();
}

export function matchShouldBeOverdue(
  status: string,
  deadlineIso: string | null,
  nowMs = Date.now(),
): boolean {
  if (status !== 'SCHEDULED' && status !== 'RESULT_SUBMITTED') return false;
  return isPastDeadline(deadlineIso, nowMs);
}

export function registrationState(
  nowMs: number,
  startIso: string | null,
  deadlineIso: string | null,
  currentCount: number,
  maxPlayers: number,
): 'NOT_OPEN' | 'OPEN' | 'FULL' | 'CLOSED' {
  if (startIso && nowMs < new Date(startIso).getTime()) return 'NOT_OPEN';
  if (deadlineIso && nowMs > new Date(deadlineIso).getTime()) return 'CLOSED';
  if (currentCount >= maxPlayers) return 'FULL';
  return 'OPEN';
}
