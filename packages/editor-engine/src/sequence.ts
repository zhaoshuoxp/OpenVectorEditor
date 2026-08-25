export function normalizeDnaSequence(value: string | undefined): string {
  return (value ?? "")
    .replace(/[^a-z]/gi, "")
    .replace(/[^ACGTN]/gi, "N")
    .toUpperCase();
}

export function getRangeSequence(
  sequence: string | undefined,
  start: number,
  end: number,
  circular: boolean
): string {
  const normalized = normalizeDnaSequence(sequence);
  if (!normalized || start < 0 || end < 0 || start >= normalized.length || end >= normalized.length) {
    return "";
  }
  if (start <= end) return normalized.slice(start, end + 1);
  return circular ? normalized.slice(start) + normalized.slice(0, end + 1) : "";
}
