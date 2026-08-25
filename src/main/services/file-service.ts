import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SequenceDocument } from "@ove/contracts";

const fastaExtensions = new Set([".fa", ".fas", ".fasta", ".fna", ".ffn"]);

async function parserModule() {
  return import("@teselagen/bio-parsers");
}

export async function canonicalPath(filePath: string): Promise<string> {
  const absolute = path.resolve(filePath);
  try {
    return await fs.realpath(absolute);
  } catch {
    return absolute;
  }
}

export async function readSequenceFile(filePath: string): Promise<SequenceDocument> {
  const resolvedPath = await canonicalPath(filePath);
  const data = await fs.readFile(resolvedPath);
  const fileName = path.basename(resolvedPath);

  if (path.extname(fileName).toLowerCase() === ".json") {
    try {
      const parsed = JSON.parse(data.toString("utf8")) as SequenceDocument;
      if (typeof parsed.sequence === "string" || typeof parsed.proteinSequence === "string") {
        return parsed;
      }
    } catch {
      // Fall through so bio-parsers can report compatible parser errors.
    }
  }

  const { anyToJson } = await parserModule();
  const results = await anyToJson(data, { fileName });
  const document = results[0]?.parsedSequence;
  if (!document) {
    throw new Error(`No sequence could be parsed from ${fileName}.`);
  }
  return document;
}

export async function readSequenceFiles(filePath: string): Promise<SequenceDocument[]> {
  const resolvedPath = await canonicalPath(filePath);
  const data = await fs.readFile(resolvedPath);
  const fileName = path.basename(resolvedPath);
  if (path.extname(fileName).toLowerCase() === ".json") {
    try {
      const parsed = JSON.parse(data.toString("utf8")) as SequenceDocument | SequenceDocument[];
      const documents = Array.isArray(parsed) ? parsed : [parsed];
      if (documents.every((document) =>
        typeof document.sequence === "string" || typeof document.proteinSequence === "string"
      )) return documents;
    } catch {
      // Let the compatible parser provide the useful error below.
    }
  }
  const { anyToJson } = await parserModule();
  const results = await anyToJson(data, { fileName });
  const documents = results.map((result) => result.parsedSequence).filter(Boolean);
  if (!documents.length) throw new Error(`No sequence could be parsed from ${fileName}.`);
  return documents;
}

export async function formatSequenceDocument(
  document: SequenceDocument,
  filePath: string
): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") {
    return JSON.stringify(document, null, 2);
  }

  const { jsonToBed, jsonToFasta, jsonToGenbank } = await parserModule();
  if (extension === ".bed") {
    return jsonToBed(document);
  }
  if (fastaExtensions.has(extension)) {
    return jsonToFasta(document);
  }
  return jsonToGenbank(document);
}

export async function atomicWriteSequenceDocument(
  document: SequenceDocument,
  filePath: string
): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  const contents = await formatSequenceDocument(document, resolvedPath);
  const temporaryPath = path.join(
    path.dirname(resolvedPath),
    `.${path.basename(resolvedPath)}.${randomUUID()}.tmp`
  );

  await fs.writeFile(temporaryPath, contents, "utf8");
  try {
    await fs.rename(temporaryPath, resolvedPath);
  } catch (error) {
    // Some Windows filesystems do not replace an existing target with rename.
    await fs.writeFile(resolvedPath, contents, "utf8");
    await fs.rm(temporaryPath, { force: true });
    if (!(error instanceof Error)) {
      throw error;
    }
  }
}

export function documentNameFromPath(filePath: string): string {
  const extension = path.extname(filePath);
  return path.basename(filePath, extension);
}

export const openFileFilters = [
  {
    name: "Sequence Files",
    extensions: [
      "gb",
      "json",
      "dna",
      "gbk",
      "gp",
      "fas",
      "fasta",
      "fa",
      "fna",
      "ffn",
      "gff",
      "gff3"
    ]
  }
];

export const saveFileFilters = [
  { name: "GenBank", extensions: ["gb"] },
  { name: "FASTA", extensions: ["fasta"] },
  { name: "TeselaGen JSON", extensions: ["json"] },
  { name: "BED", extensions: ["bed"] }
];

export const alignmentFileFilters = [
  {
    name: "Sequence and Trace Files",
    extensions: ["ab1", "abi", "gb", "gbk", "json", "fasta", "fa", "fas", "fna"]
  }
];
