import type { AlignmentSequence, SequenceDocument, SequenceSelection } from "@ove/contracts";
import { getRangeSequence, normalizeDnaSequence } from "@ove/editor-engine/sequence";

export function selectionToDisplayRange(selection: SequenceSelection): { start: number; end: number } {
  return { start: selection.start + 1, end: selection.end + 1 };
}

export function displayRangeToInternal(start: number, end: number): SequenceSelection {
  return { start: start - 1, end: end - 1 };
}

export function selectedSequence(
  document: SequenceDocument,
  selection: SequenceSelection | null
): string {
  if (!selection) return "";
  return getRangeSequence(
    document.sequence,
    selection.start,
    selection.end,
    document.circular !== false
  );
}

export function documentToAlignmentSequence(document: SequenceDocument, fallbackName: string): AlignmentSequence {
  const sequence = normalizeDnaSequence(document.sequence ?? document.proteinSequence);
  return {
    id: document.id ?? crypto.randomUUID(),
    name: document.name || fallbackName,
    sequence,
    ...(isChromatogramData(document.chromatogramData)
      ? { chromatogramData: document.chromatogramData }
      : {})
  };
}

function isChromatogramData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
