// PostgreSQL text/JSONB require well-formed Unicode without a null character.
export function isStorableText(value: string): boolean {
  return value.isWellFormed() && !value.includes('\0');
}
