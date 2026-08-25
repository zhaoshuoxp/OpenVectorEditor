declare module "@teselagen/bio-parsers" {
  import type { SequenceDocument } from "@ove/contracts";

  export function anyToJson(
    data: Buffer | Uint8Array | string,
    options?: { fileName?: string }
  ): Promise<Array<{ parsedSequence: SequenceDocument }>>;
  export function jsonToFasta(document: SequenceDocument): string;
  export function jsonToBed(document: SequenceDocument): string;
  export function jsonToGenbank(document: SequenceDocument): string;
}

declare module "biomsa" {
  interface AlignOptions {
    gapopen?: number;
    gapextend?: number;
    method?: "auto" | "complete" | "diag";
    type?: "auto" | "amino" | "nucleic";
    gapchar?: string;
    debug?: boolean;
  }

  const BioMSA: {
    align(sequences: string[], options?: AlignOptions): Promise<string[]>;
  };

  export default BioMSA;
}

declare module "@teselagen/ove" {
  import type { SequenceDocument, SequenceSelection } from "@ove/contracts";

  export interface OveEditorState {
    sequenceData?: SequenceDocument;
    selectionLayer?: SequenceSelection;
    [key: string]: unknown;
  }

  export interface OveEditorInstance {
    updateEditor(values: Record<string, unknown>): void;
    addAlignment(values: Record<string, unknown>): void;
    getState(): OveEditorState;
    close(): void;
  }

  export function createVectorEditor(
    node: HTMLElement | "createDomNodeForMe",
    options?: Record<string, unknown>
  ): OveEditorInstance;
}

declare module "@teselagen/ove/style.css";
