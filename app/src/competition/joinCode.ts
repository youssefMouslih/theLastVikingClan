// Join code format (§22): VIK prefix + 5 unambiguous chars (no 0/O/1/I).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(prefix = 'VIK'): string {
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${prefix}${suffix}`;
}
