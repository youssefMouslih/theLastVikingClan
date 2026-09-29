// Player replacement rules (§46-51).
// Default: Future Matches Only. History preserved. Clan membership untouched.

export interface ReplacementValidation {
  ok: boolean;
  error?: string;
}

export function validateReplacement(args: {
  originalPlayerId: string;
  replacementPlayerId: string;
  participantPlayerIds: string[]; // current competition participants
  isReplacementClanMember: boolean;
  isReplacementActive: boolean;
}): ReplacementValidation {
  if (args.originalPlayerId === args.replacementPlayerId) {
    return { ok: false, error: 'Replacement must be a different player.' };
  }
  if (!args.isReplacementClanMember || !args.isReplacementActive) {
    return { ok: false, error: 'Replacement must be an ACTIVE clan member.' };
  }
  if (args.participantPlayerIds.includes(args.replacementPlayerId)) {
    return { ok: false, error: 'Player is already participating in this competition (Rule 13).' };
  }
  if (!args.participantPlayerIds.includes(args.originalPlayerId)) {
    return { ok: false, error: 'Original player is not in this competition.' };
  }
  return { ok: true };
}
