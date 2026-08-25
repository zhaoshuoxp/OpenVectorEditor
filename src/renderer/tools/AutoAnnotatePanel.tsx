import { useMemo, useState } from "react";
import type { AnnotationKind, SequenceAnnotation, SequenceDocument } from "@ove/contracts";
import { normalizeDnaSequence } from "@ove/editor-engine/sequence";
import { PanelHeader } from "./PrimerDesignPanel";

interface AutoAnnotatePanelProps {
  kind: Extract<AnnotationKind, "features" | "parts" | "primers">;
  document: SequenceDocument;
  close(): void;
  apply(document: SequenceDocument): void;
}

interface AnnotationTemplate {
  name: string;
  description?: string;
  sequence: string;
  type?: string;
  isRegex: boolean;
  matchType: "dna" | "protein";
}

export function AutoAnnotatePanel({ kind, document, close, apply }: AutoAnnotatePanelProps) {
  const label = kind === "features" ? "Features" : kind === "parts" ? "Parts" : "Primers";
  const [source, setSource] = useState("");
  const [format, setFormat] = useState<"csv" | "ape">("csv");
  const [status, setStatus] = useState("Paste a CSV table or ApE feature list to find annotations in this sequence.");
  const [isError, setIsError] = useState(false);
  const [matches, setMatches] = useState<SequenceAnnotation[]>([]);
  const sequenceLength = useMemo(() => normalizeDnaSequence(document.sequence).length, [document.sequence]);

  const preview = (): void => {
    try {
      const templates = format === "csv" ? parseCsvTemplates(source) : parseApeTemplates(source);
      if (!templates.length) throw new Error("No annotation rows were found.");
      const found = templates.flatMap((template) => findTemplateMatches(document, template));
      setMatches(found);
      setStatus(found.length ? `Found ${found.length} ${label.toLowerCase()}.` : `No ${label.toLowerCase()} were found in this sequence.`);
      setIsError(!found.length);
    } catch (error) {
      setMatches([]);
      setStatus(error instanceof Error ? error.message : "Unable to parse annotation list.");
      setIsError(true);
    }
  };

  const addMatches = (): void => {
    if (!matches.length) return;
    apply({ ...document, [kind]: [...(document[kind] ?? []), ...matches] });
    close();
  };

  return (
    <section className="toolPanel" aria-label={`Auto Annotate ${label}`}>
      <PanelHeader title={`Auto Annotate ${label}`} close={close} />
      <div className="toolPanel__body toolPanel__body--narrow">
        <section className="toolCard autoAnnotateCard">
          <div className="toolChoices toolChoices--row">
            <label><input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} /> CSV</label>
            <label><input type="radio" checked={format === "ape"} onChange={() => setFormat("ape")} /> ApE feature list</label>
          </div>
          <p className="toolCard__help">
            {format === "csv"
              ? "Columns: name, description, sequence, type, isRegex, matchType. The first row must be a header."
              : "Tab-separated columns: name, sequence, type. One annotation per line."}
          </p>
          <textarea
            aria-label="Annotation list"
            spellCheck={false}
            value={source}
            placeholder={format === "csv"
              ? "name,description,sequence,type,isRegex,matchType\nM13-fwd,,TGTAAAACGACGGCCAGT,primer_bind,false,dna"
              : "M13-fwd\tTGTAAAACGACGGCCAGT\tprimer_bind"}
            onChange={(event) => setSource(event.target.value)}
          />
          <div className="toolPanel__actions">
            <button type="button" onClick={preview}>Find Matches</button>
            <button className="toolPanel__primary" type="button" disabled={!matches.length} onClick={addMatches}>Add {matches.length || ""} {label}</button>
            <span className={isError ? "toolStatus toolStatus--error" : "toolStatus"}>{status}</span>
          </div>
        </section>
        {!!matches.length && (
          <section className="toolCard">
            <h2>Preview</h2>
            <ol className="annotationPreview">
              {matches.map((match) => (
                <li key={match.id}>
                  <strong>{match.name}</strong>
                  <span>{match.start + 1}-{match.end + 1}</span>
                  <span>{match.forward === false ? "Reverse" : "Forward"}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {!sequenceLength && <p className="toolStatus toolStatus--error">The current document has no DNA sequence.</p>}
      </div>
    </section>
  );
}

export function parseCsvTemplates(source: string): AnnotationTemplate[] {
  const rows = parseCsv(source).filter((row) => row.some((cell) => cell.trim()));
  const header = rows.shift()?.map((cell) => cell.trim().toLowerCase());
  if (!header?.includes("name") || !header.includes("sequence")) {
    throw new Error("CSV must contain name and sequence columns.");
  }
  return rows.map((row, rowIndex) => {
    const value = (column: string) => row[header.indexOf(column)]?.trim() ?? "";
    const name = value("name");
    const sequence = value("sequence");
    if (!name || !sequence) throw new Error(`CSV row ${rowIndex + 2} requires name and sequence.`);
    const description = value("description");
    const type = value("type");
    return {
      name,
      sequence,
      ...(description ? { description } : {}),
      ...(type ? { type } : {}),
      isRegex: /^true$/i.test(value("isregex")),
      matchType: /^protein$/i.test(value("matchtype")) ? "protein" : "dna"
    };
  });
}

export function parseApeTemplates(source: string): AnnotationTemplate[] {
  return source.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    const [name, sequence, type] = line.split("\t").map((value) => value.trim());
    if (!name || !sequence) throw new Error(`ApE row ${index + 1} requires name and sequence.`);
    return { name, sequence, ...(type ? { type } : {}), isRegex: false, matchType: "dna" };
  });
}

export function findTemplateMatches(
  document: SequenceDocument,
  template: AnnotationTemplate
): SequenceAnnotation[] {
  const sequence = normalizeDnaSequence(document.sequence);
  if (!sequence) return [];
  if (template.matchType === "protein") return findProteinMatches(sequence, template, document.circular !== false);
  const expression = template.isRegex
    ? template.sequence
    : iupacToRegularExpression(template.sequence);
  const forward = collectDnaMatches(sequence, expression, document.circular !== false, true, template);
  if (template.isRegex) return forward;
  const reverseExpression = iupacToRegularExpression(reverseComplement(template.sequence));
  return [...forward, ...collectDnaMatches(sequence, reverseExpression, document.circular !== false, false, template)]
    .filter((match, index, all) => all.findIndex((candidate) =>
      candidate.start === match.start && candidate.end === match.end && candidate.forward === match.forward
    ) === index);
}

function collectDnaMatches(
  sequence: string,
  expression: string,
  circular: boolean,
  forward: boolean,
  template: AnnotationTemplate
): SequenceAnnotation[] {
  const maximumExtra = Math.min(10_000, Math.max(0, expression.length * 4));
  const searchable = circular ? sequence + sequence.slice(0, maximumExtra) : sequence;
  let regularExpression: RegExp;
  try {
    regularExpression = new RegExp(`(?=(${expression}))`, "gi");
  } catch {
    throw new Error(`Invalid regular expression for ${template.name}.`);
  }
  return [...searchable.matchAll(regularExpression)]
    .filter((match) => match.index !== undefined && match.index < sequence.length && match[1])
    .map((match) => {
      const start = match.index!;
      const length = match[1]!.length;
      return annotationFromMatch(template, start, (start + length - 1) % sequence.length, forward);
    });
}

function findProteinMatches(sequence: string, template: AnnotationTemplate, circular: boolean): SequenceAnnotation[] {
  const proteinPattern = template.isRegex ? template.sequence : escapeRegularExpression(template.sequence.toUpperCase());
  const results: SequenceAnnotation[] = [];
  for (const [dna, forward] of [[sequence, true], [reverseComplement(sequence), false]] as const) {
    const extended = circular ? dna + dna.slice(0, 300) : dna;
    for (let frame = 0; frame < 3; frame += 1) {
      const protein = translate(extended.slice(frame));
      let expression: RegExp;
      try { expression = new RegExp(`(?=(${proteinPattern}))`, "gi"); }
      catch { throw new Error(`Invalid protein regular expression for ${template.name}.`); }
      for (const match of protein.matchAll(expression)) {
        if (match.index === undefined || !match[1]) continue;
        const nucleotideStart = frame + match.index * 3;
        const nucleotideLength = match[1].length * 3;
        if (nucleotideStart >= sequence.length) continue;
        const start = forward
          ? nucleotideStart
          : (sequence.length - ((nucleotideStart + nucleotideLength) % sequence.length)) % sequence.length;
        const end = (start + nucleotideLength - 1) % sequence.length;
        results.push(annotationFromMatch(template, start, end, forward));
      }
    }
  }
  return results;
}

function annotationFromMatch(
  template: AnnotationTemplate,
  start: number,
  end: number,
  forward: boolean
): SequenceAnnotation {
  return {
    id: crypto.randomUUID(),
    start,
    end,
    name: template.name,
    forward,
    ...(template.description ? { description: template.description } : {}),
    ...(template.type ? { type: template.type } : {})
  };
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const iupac: Record<string, string> = {
  A: "A", C: "C", G: "G", T: "T", U: "T", R: "[AG]", Y: "[CT]", S: "[GC]",
  W: "[AT]", K: "[GT]", M: "[AC]", B: "[CGT]", D: "[AGT]", H: "[ACT]", V: "[ACG]", N: "[ACGT]"
};

function iupacToRegularExpression(sequence: string): string {
  return [...sequence.toUpperCase().replace(/\s/g, "")].map((base) => iupac[base] ?? escapeRegularExpression(base)).join("");
}

function reverseComplement(sequence: string): string {
  const complement: Record<string, string> = {
    A: "T", T: "A", U: "A", C: "G", G: "C", R: "Y", Y: "R", S: "S", W: "W",
    K: "M", M: "K", B: "V", V: "B", D: "H", H: "D", N: "N"
  };
  return [...sequence.toUpperCase().replace(/\s/g, "")].reverse().map((base) => complement[base] ?? "N").join("");
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const codons: Record<string, string> = {
  TTT:"F",TTC:"F",TTA:"L",TTG:"L",TCT:"S",TCC:"S",TCA:"S",TCG:"S",TAT:"Y",TAC:"Y",TAA:"*",TAG:"*",TGT:"C",TGC:"C",TGA:"*",TGG:"W",
  CTT:"L",CTC:"L",CTA:"L",CTG:"L",CCT:"P",CCC:"P",CCA:"P",CCG:"P",CAT:"H",CAC:"H",CAA:"Q",CAG:"Q",CGT:"R",CGC:"R",CGA:"R",CGG:"R",
  ATT:"I",ATC:"I",ATA:"I",ATG:"M",ACT:"T",ACC:"T",ACA:"T",ACG:"T",AAT:"N",AAC:"N",AAA:"K",AAG:"K",AGT:"S",AGC:"S",AGA:"R",AGG:"R",
  GTT:"V",GTC:"V",GTA:"V",GTG:"V",GCT:"A",GCC:"A",GCA:"A",GCG:"A",GAT:"D",GAC:"D",GAA:"E",GAG:"E",GGT:"G",GGC:"G",GGA:"G",GGG:"G"
};

function translate(sequence: string): string {
  let protein = "";
  for (let index = 0; index + 2 < sequence.length; index += 3) protein += codons[sequence.slice(index, index + 3)] ?? "X";
  return protein;
}
