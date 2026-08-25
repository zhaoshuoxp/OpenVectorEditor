import { useMemo, useState } from "react";
import type {
  NumericRangePreference,
  PrimerDesignRequest,
  PrimerDesignResult,
  SequenceDocument,
  SequenceSelection
} from "@ove/contracts";
import { getRangeSequence, normalizeDnaSequence } from "@ove/editor-engine/sequence";
import { selectedSequence, selectionToDisplayRange } from "../domain/sequence";

interface PrimerDesignPanelProps {
  document: SequenceDocument;
  selection: SequenceSelection | null;
  close(): void;
  design(request: PrimerDesignRequest): Promise<PrimerDesignResult>;
  cancel(): Promise<void>;
}

interface PrimerFormState {
  template: string;
  sequenceId: string;
  task: PrimerDesignRequest["task"];
  productSizeRange: string;
  numReturn: number;
  size: NumericRangePreference;
  tm: NumericRangePreference;
  gc: NumericRangePreference;
  vectorStart: number | "";
  vectorEnd: number | "";
}

export function PrimerDesignPanel({ document, selection, close, design, cancel }: PrimerDesignPanelProps) {
  const initialSelection = useMemo(() => selectedSequence(document, selection), [document, selection]);
  const displaySelection = selection ? selectionToDisplayRange(selection) : null;
  const [form, setForm] = useState<PrimerFormState>({
    template: initialSelection,
    sequenceId: "ove_primer_design",
    task: "both",
    productSizeRange: "100-300",
    numReturn: 5,
    size: { min: 18, opt: 20, max: 27 },
    tm: { min: 57, opt: 60, max: 63 },
    gc: { min: 20, opt: 50, max: 80 },
    vectorStart: displaySelection?.start ?? (document.sequence ? 1 : ""),
    vectorEnd: displaySelection?.end ?? document.sequence?.length ?? ""
  });
  const [status, setStatus] = useState(
    initialSelection
      ? `Loaded selected range ${displaySelection!.start}-${displaySelection!.end} (${initialSelection.length} bp).`
      : "No active selection found. Paste a sequence, use the full vector, or load a coordinate range."
  );
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PrimerDesignResult | null>(null);

  const setStatusMessage = (message: string, error = false): void => {
    setStatus(message);
    setIsError(error);
  };

  const useSelection = (): void => {
    const sequence = selectedSequence(document, selection);
    if (!selection || !sequence) {
      setStatusMessage("No active sequence selection found. Paste a sequence or load one from vector coordinates.", true);
      return;
    }
    const display = selectionToDisplayRange(selection);
    setForm((current) => ({
      ...current,
      template: sequence,
      vectorStart: display.start,
      vectorEnd: display.end
    }));
    setStatusMessage(`Loaded selected range ${display.start}-${display.end} (${sequence.length} bp).`);
  };

  const useFullVector = (): void => {
    const sequence = normalizeDnaSequence(document.sequence);
    setForm((current) => ({
      ...current,
      template: sequence,
      vectorStart: sequence ? 1 : "",
      vectorEnd: sequence.length || ""
    }));
    setStatusMessage(`Loaded full vector (${sequence.length} bp).`);
  };

  const loadRange = (): void => {
    if (form.vectorStart === "" || form.vectorEnd === "") {
      setStatusMessage("Vector start and end are required.", true);
      return;
    }
    const sequence = getRangeSequence(
      document.sequence,
      form.vectorStart - 1,
      form.vectorEnd - 1,
      document.circular !== false
    );
    if (!sequence) {
      setStatusMessage("Unable to load that coordinate range from the vector.", true);
      return;
    }
    setForm((current) => ({ ...current, template: sequence }));
    setStatusMessage(`Loaded vector range ${form.vectorStart}-${form.vectorEnd} (${sequence.length} bp).`);
  };

  const submit = async (): Promise<void> => {
    const request: PrimerDesignRequest = {
      sequence: normalizeDnaSequence(form.template),
      sequenceId: form.sequenceId.trim() || "ove_primer_design",
      task: form.task,
      productSizeRange: form.productSizeRange.trim() || "100-300",
      numReturn: form.numReturn,
      size: form.size,
      tm: form.tm,
      gc: form.gc
    };
    const validation = validate(request);
    if (validation) {
      setStatusMessage(validation, true);
      return;
    }
    setBusy(true);
    setStatusMessage("Running primer3_core...");
    try {
      const response = await design(request);
      setResult(response);
      if (response.error) setStatusMessage(response.error, true);
      else if (!response.results.length) {
        const explanation = [response.explain.left, response.explain.right, response.explain.pair]
          .filter(Boolean)
          .join(" | ");
        setStatusMessage(explanation || "Primer3 did not return primers for these constraints.", true);
      } else setStatusMessage(`Primer3 returned ${response.results.length} result(s).`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Primer3 failed.", true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (sequence: string): Promise<void> => {
    await navigator.clipboard.writeText(sequence);
    setStatusMessage("Primer sequence copied.");
  };

  return (
    <section className="toolPanel primerDesignPanel" aria-label="Primer Design">
      <PanelHeader title="Primer Design" close={close} />
      <div className="primerDesignPanel__body">
        <div className="primerDesignSection primerDesignSection--sequence">
          <label className="primerDesignField primerDesignField--wide">
            <span>Template Sequence</span>
            <textarea
              data-testid="primer-template"
              rows={8}
              spellCheck={false}
              value={form.template}
              onChange={(event) => setForm({ ...form, template: event.target.value })}
            />
          </label>
          <div className="primerDesignActions">
            <button type="button" onClick={useSelection}>Use Selection</button>
            <button type="button" onClick={useFullVector}>Use Full Vector</button>
          </div>
          <div className="primerDesignCoordinateRow">
            <NumberField
              label="Vector Start"
              value={form.vectorStart}
              min={1}
              onChange={(vectorStart) => setForm({ ...form, vectorStart })}
            />
            <NumberField
              label="Vector End"
              value={form.vectorEnd}
              min={1}
              onChange={(vectorEnd) => setForm({ ...form, vectorEnd })}
            />
            <button type="button" onClick={loadRange}>Load Range</button>
          </div>
          <label className="primerDesignField primerDesignField--wide">
            <span>Sequence Id</span>
            <input value={form.sequenceId} onChange={(event) => setForm({ ...form, sequenceId: event.target.value })} />
          </label>
        </div>

        <div className="primerDesignSection">
          <h2>Design Mode</h2>
          <div className="primerDesignChoices">
            {(["both", "forward", "reverse"] as const).map((task) => (
              <label key={task}>
                <input
                  type="radio"
                  name="primer-design-task"
                  value={task}
                  checked={form.task === task}
                  onChange={() => setForm({ ...form, task })}
                />
                {task === "both" ? "Pair" : task === "forward" ? "Forward only" : "Reverse only"}
              </label>
            ))}
          </div>
          <NumberField label="Number To Return" value={form.numReturn} min={1} max={50} onChange={(numReturn) => setForm({ ...form, numReturn: numReturn || 1 })} />
          <label className="primerDesignField">
            <span>Product Size Range</span>
            <input value={form.productSizeRange} onChange={(event) => setForm({ ...form, productSizeRange: event.target.value })} />
          </label>
        </div>

        <div className="primerDesignSection primerDesignSection--parameters">
          <h2>Parameters</h2>
          <div className="primerDesignTripleHeader"><span /><span>Min</span><span>Opt</span><span>Max</span></div>
          <RangeFields label="Primer Length" value={form.size} onChange={(size) => setForm({ ...form, size })} />
          <RangeFields label="Tm" value={form.tm} step={0.1} onChange={(tm) => setForm({ ...form, tm })} />
          <RangeFields label="GC%" value={form.gc} step={0.1} onChange={(gc) => setForm({ ...form, gc })} />
        </div>

        <div className="primerDesignRunBar">
          <button className="toolPanel__primary" type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Designing…" : "Design Primers"}
          </button>
          {busy && <button type="button" onClick={() => void cancel()}>Cancel</button>}
          <span className={`primerDesignStatus${isError ? " primerDesignStatus--error" : ""}`} aria-live="polite">{status}</span>
        </div>

        <div className="primerDesignResults" aria-live="polite">
          {!result && <div className="primerDesignEmptyResult">Primer3 results will appear here.</div>}
          {result && !result.results.length && <div className="primerDesignEmptyResult">Primer3 did not return primers for these constraints.</div>}
          {result?.results.map((item) => (
            <article className="primerDesignResult" key={item.index}>
              <div className="primerDesignResult__summary">
                <strong>#{item.index}</strong>
                {item.productSize && <span>Product {item.productSize} bp</span>}
                {item.penalty && <span>Penalty {item.penalty}</span>}
              </div>
              {item.forward && <PrimerRow label="Forward" primer={item.forward} copy={copy} />}
              {item.reverse && <PrimerRow label="Reverse" primer={item.reverse} copy={copy} />}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PanelHeader({ title, close }: { title: string; close(): void }) {
  return (
    <div className="toolPanel__header">
      <h1>{title}</h1>
      <button className="toolPanel__close" type="button" aria-label={`Close ${title}`} onClick={close}>Close</button>
    </div>
  );
}

function NumberField({ label, value, min, max, step, onChange }: {
  label: string;
  value: number | "";
  min?: number;
  max?: number;
  step?: number;
  onChange(value: number | ""): void;
}) {
  return (
    <label className="primerDesignField">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
      />
    </label>
  );
}

function RangeFields({ label, value, step, onChange }: {
  label: string;
  value: NumericRangePreference;
  step?: number;
  onChange(value: NumericRangePreference): void;
}) {
  return (
    <div className="primerDesignTriple">
      <span>{label}</span>
      {(["min", "opt", "max"] as const).map((key) => (
        <input
          aria-label={`${label} ${key}`}
          key={key}
          type="number"
          step={step}
          value={value[key]}
          onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
        />
      ))}
    </div>
  );
}

function PrimerRow({ label, primer, copy }: {
  label: string;
  primer: NonNullable<PrimerDesignResult["results"][number]["forward"]>;
  copy(sequence: string): Promise<void>;
}) {
  return (
    <div className="primerDesignResult__primer">
      <span>{label}</span>
      <code>{primer.sequence}</code>
      <small>
        Tm {formatNumber(primer.tm)} | GC {formatNumber(primer.gc)}% | {primer.start ?? ""}:{primer.length ?? ""}
      </small>
      <button type="button" onClick={() => void copy(primer.sequence)}>Copy</button>
    </div>
  );
}

function formatNumber(value: string | undefined): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "—";
}

function validate(request: PrimerDesignRequest): string {
  if (!request.sequence) return "Please provide a template sequence, use the current selection, or load a vector coordinate range.";
  if (request.sequence.length < 20) return "Template sequence is too short for Primer3.";
  const ranges: Array<[string, NumericRangePreference]> = [
    ["Primer length", request.size],
    ["Tm", request.tm],
    ["GC%", request.gc]
  ];
  for (const [label, value] of ranges) {
    if (![value.min, value.opt, value.max].every(Number.isFinite)) return `${label} min, opt, and max values are required.`;
    if (value.min > value.opt || value.opt > value.max) return `${label} values must be ordered as min <= opt <= max.`;
  }
  if (request.task === "both" && !/^\d+\s*-\s*\d+(\s+\d+\s*-\s*\d+)*$/.test(request.productSizeRange)) {
    return "Product size range must look like 100-300, or multiple ranges separated by spaces.";
  }
  return "";
}
