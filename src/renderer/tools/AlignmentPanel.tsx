import { useState } from "react";
import type {
  AlignmentFile,
  AlignmentRequest,
  AlignmentResult,
  AlignmentSequence,
  SequenceDocument
} from "@ove/contracts";
import { documentToAlignmentSequence } from "../domain/sequence";
import { PanelHeader } from "./PrimerDesignPanel";

interface AlignmentPanelProps {
  document: SequenceDocument;
  close(): void;
  chooseFiles(): Promise<AlignmentFile[]>;
  align(request: AlignmentRequest): Promise<AlignmentResult>;
  cancel(): Promise<void>;
  apply(result: AlignmentResult): void;
}

export function AlignmentPanel({ document, close, chooseFiles, align, cancel, apply }: AlignmentPanelProps) {
  const [sequences, setSequences] = useState<AlignmentSequence[]>([
    documentToAlignmentSequence(document, "Current Sequence")
  ]);
  const [mode, setMode] = useState<AlignmentRequest["mode"]>("multiple");
  const [autoTrim, setAutoTrim] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Add one or more sequences to create an offline alignment.");
  const [isError, setIsError] = useState(false);

  const addFiles = async (): Promise<void> => {
    try {
      const files = await chooseFiles();
      const added = files
        .map(({ filePath, document: addedDocument }, index) =>
          documentToAlignmentSequence(addedDocument, `${filePath.split(/[\\/]/).pop() ?? "Sequence"} ${index + 1}`)
        )
        .filter(({ sequence }) => sequence.length > 0);
      setSequences((current) => [...current, ...added]);
      if (added.length) {
        setStatus(`Added ${added.length} sequence(s).`);
        setIsError(false);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to add sequence files.");
      setIsError(true);
    }
  };

  const run = async (): Promise<void> => {
    if (sequences.length < 2) {
      setStatus("At least two sequences are required.");
      setIsError(true);
      return;
    }
    setBusy(true);
    setStatus("Running BioMSA locally…");
    setIsError(false);
    try {
      const result = await align({ sequences, mode, autoTrim });
      apply(result);
      setStatus(`Alignment complete: ${sequences.length} sequences.`);
      close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Alignment failed.");
      setIsError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="toolPanel" aria-label="Alignment">
      <PanelHeader title="Alignment" close={close} />
      <div className="toolPanel__body toolPanel__body--narrow">
        <section className="toolCard">
          <h2>Sequences</h2>
          <p className="toolCard__help">The current vector is the reference sequence. ABI/AB1, GenBank, FASTA and TeselaGen JSON files are supported.</p>
          <ol className="alignmentList">
            {sequences.map((sequence, index) => (
              <li key={`${sequence.id}-${index}`}>
                <span className="alignmentList__index">{index === 0 ? "Reference" : index + 1}</span>
                <input
                  aria-label={`Sequence ${index + 1} name`}
                  value={sequence.name}
                  onChange={(event) => setSequences((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: event.target.value } : item
                  ))}
                />
                <span>{sequence.sequence.length.toLocaleString()} bp</span>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => setSequences((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >Remove</button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void addFiles()}>Add Files…</button>
        </section>

        <section className="toolCard">
          <h2>Alignment Method</h2>
          <div className="toolChoices">
            <label><input type="radio" checked={mode === "multiple"} onChange={() => setMode("multiple")} /> Multiple sequence alignment</label>
            <label><input type="radio" checked={mode === "pairwise"} onChange={() => setMode("pairwise")} /> Pairwise to current vector</label>
            <label><input type="radio" checked={mode === "reference"} onChange={() => setMode("reference")} /> Align to reference</label>
            <label><input type="checkbox" checked={autoTrim} onChange={(event) => setAutoTrim(event.target.checked)} /> Quality trim chromatograms</label>
          </div>
        </section>

        <div className="toolPanel__actions">
          <button className="toolPanel__primary" type="button" disabled={busy} onClick={() => void run()}>{busy ? "Aligning…" : "Create Alignment"}</button>
          {busy && <button type="button" onClick={() => void cancel()}>Cancel</button>}
          <span className={isError ? "toolStatus toolStatus--error" : "toolStatus"} aria-live="polite">{status}</span>
        </div>
      </div>
    </section>
  );
}
