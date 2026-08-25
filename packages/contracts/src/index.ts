import { z } from "zod";
export { IPC_CHANNELS } from "./ipc";

export type AnnotationKind =
  | "features"
  | "parts"
  | "primers"
  | "translations"
  | "orfs"
  | "cutsites";

export interface SequenceAnnotation {
  id: string;
  start: number;
  end: number;
  name?: string;
  type?: string;
  forward?: boolean;
  color?: string;
  locations?: Array<{ start: number; end: number }>;
  [key: string]: unknown;
}

export interface SequenceDocument {
  id?: string;
  name?: string;
  description?: string;
  sequence?: string;
  proteinSequence?: string;
  circular?: boolean;
  features?: SequenceAnnotation[];
  parts?: SequenceAnnotation[];
  primers?: SequenceAnnotation[];
  translations?: SequenceAnnotation[];
  orfs?: SequenceAnnotation[];
  cutsites?: SequenceAnnotation[];
  [key: string]: unknown;
}

export interface SequenceSelection {
  start: number;
  end: number;
}

export interface LaunchContext {
  document: SequenceDocument;
  filePath?: string;
}

export interface SaveDocumentRequest {
  document: SequenceDocument;
  mode: "save" | "saveAs";
}

export interface SaveDocumentResult {
  canceled: boolean;
  filePath?: string;
  documentName?: string;
}

export interface NumericRangePreference {
  min: number;
  opt: number;
  max: number;
}

export interface PrimerDesignRequest {
  sequence: string;
  sequenceId: string;
  task: "both" | "forward" | "reverse";
  size: NumericRangePreference;
  tm: NumericRangePreference;
  gc: NumericRangePreference;
  productSizeRange: string;
  numReturn: number;
  target?: { start: number; length: number };
  includedRegion?: { start: number; length: number };
}

export interface PrimerResultItem {
  sequence: string;
  tm?: string;
  gc?: string;
  start?: number;
  length?: number;
}

export interface PrimerDesignResult {
  values: Record<string, string>;
  results: Array<{
    index: number;
    penalty?: string;
    productSize?: string;
    forward: PrimerResultItem | null;
    reverse: PrimerResultItem | null;
  }>;
  error?: string;
  explain: {
    pair?: string;
    left?: string;
    right?: string;
  };
  binaryPath: string;
  primer3Input: string;
  stderr: string;
  rawOutput: string;
}

export interface AlignmentSequence {
  id: string;
  name: string;
  sequence: string;
  chromatogramData?: Record<string, unknown>;
}

export interface AlignmentFile {
  filePath: string;
  document: SequenceDocument;
}

export interface AlignmentRequest {
  sequences: AlignmentSequence[];
  mode: "multiple" | "pairwise" | "reference";
  autoTrim: boolean;
}

export interface AlignmentResult {
  id: string;
  name: string;
  mode: AlignmentRequest["mode"];
  tracks: Array<{
    sequenceData: AlignmentSequence;
    alignmentData: {
      id: string;
      name: string;
      sequence: string;
    };
    chromatogramData?: Record<string, unknown>;
  }>;
  pairwiseTracks?: AlignmentResult["tracks"][];
}

export interface DocumentRevision {
  id: string;
  savedAt: string;
  filePath: string;
  document: SequenceDocument;
}

export interface AppPreferences {
  isDarkMode: boolean;
  axisFontScalePercent: 33 | 50 | 75 | 100 | 125 | 150 | 200;
}

export type NativeCommand = "new-file" | "open-file" | "primer-design";

export type UpdateStatus =
  | { state: "checking" }
  | { state: "available"; version?: string }
  | { state: "not-available" }
  | { state: "progress"; percent: number }
  | { state: "downloaded"; version?: string }
  | { state: "error"; message: string };

export interface DesktopApi {
  getLaunchContext(): Promise<LaunchContext>;
  openFiles(): Promise<void>;
  saveDocument(request: SaveDocumentRequest): Promise<SaveDocumentResult>;
  designPrimers(request: PrimerDesignRequest): Promise<PrimerDesignResult>;
  cancelPrimerDesign(): Promise<void>;
  runAlignment(request: AlignmentRequest): Promise<AlignmentResult>;
  cancelAlignment(): Promise<void>;
  chooseAlignmentFiles(): Promise<AlignmentFile[]>;
  listRevisions(): Promise<DocumentRevision[]>;
  getRevision(id: string): Promise<DocumentRevision | null>;
  getPreferences(): Promise<AppPreferences>;
  setPreferences(preferences: Partial<AppPreferences>): Promise<AppPreferences>;
  restartForUpdate(): Promise<void>;
  onNativeCommand(listener: (command: NativeCommand) => void): () => void;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
}

const finiteNumber = z.number().finite();
const numericRangeSchema = z
  .object({ min: finiteNumber, opt: finiteNumber, max: finiteNumber })
  .refine(({ min, opt, max }) => min <= opt && opt <= max, {
    message: "Values must be ordered min <= opt <= max"
  });

export const sequenceDocumentSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    sequence: z.string().optional(),
    proteinSequence: z.string().optional(),
    circular: z.boolean().optional()
  })
  .passthrough();

export const saveDocumentRequestSchema = z.object({
  document: sequenceDocumentSchema,
  mode: z.enum(["save", "saveAs"])
});

export const primerDesignRequestSchema = z.object({
  sequence: z.string().min(20).max(2_000_000),
  sequenceId: z.string().min(1).max(256),
  task: z.enum(["both", "forward", "reverse"]),
  size: numericRangeSchema,
  tm: numericRangeSchema,
  gc: numericRangeSchema,
  productSizeRange: z.string().regex(/^\d+\s*-\s*\d+(\s+\d+\s*-\s*\d+)*$/),
  numReturn: z.number().int().min(1).max(50),
  target: z.object({ start: z.number().int().nonnegative(), length: z.number().int().positive() }).optional(),
  includedRegion: z
    .object({ start: z.number().int().nonnegative(), length: z.number().int().positive() })
    .optional()
});

export const alignmentRequestSchema = z.object({
  sequences: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        sequence: z.string().min(1).max(2_000_000),
        chromatogramData: z.record(z.unknown()).optional()
      })
    )
    .min(2)
    .max(100),
  mode: z.enum(["multiple", "pairwise", "reference"]),
  autoTrim: z.boolean()
});

export const preferencesPatchSchema = z.object({
  isDarkMode: z.boolean().optional(),
  axisFontScalePercent: z.union([
    z.literal(33),
    z.literal(50),
    z.literal(75),
    z.literal(100),
    z.literal(125),
    z.literal(150),
    z.literal(200)
  ]).optional()
});
