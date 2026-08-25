import { randomUUID } from "node:crypto";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { AlignmentRequest, AlignmentResult, AlignmentSequence } from "@ove/contracts";

const alignmentTimeoutMilliseconds = 60_000;

interface WorkerResponse {
  alignedGroups?: string[][];
  error?: string;
}

export class AlignmentService {
  private readonly activeWorkers = new Set<Worker>();

  public constructor(
    private readonly workerPath = path.join(__dirname, "alignment-worker.cjs")
  ) {}

  public async align(request: AlignmentRequest): Promise<AlignmentResult> {
    const sequences = request.sequences.map((sequence) =>
      request.autoTrim ? trimChromatogramSequence(sequence) : sequence
    );
    const groups =
      request.mode === "multiple"
        ? [sequences.map(({ sequence }) => sequence)]
        : sequences.slice(1).map((sequence) => [sequences[0]!.sequence, sequence.sequence]);
    const alignedGroups = await this.runWorker(groups);
    const id = randomUUID();

    if (request.mode === "multiple") {
      return {
        id,
        name: `${sequences[0]!.name} Alignment`,
        mode: request.mode,
        tracks: toTracks(sequences, alignedGroups[0] ?? [])
      };
    }

    const pairwiseTracks = alignedGroups.map((aligned, index) =>
      toTracks([sequences[0]!, sequences[index + 1]!], aligned)
    );
    return {
      id,
      name: `${sequences[0]!.name} Alignment`,
      mode: request.mode,
      tracks: pairwiseTracks[0] ?? [],
      pairwiseTracks
    };
  }

  public cancelAll(): void {
    for (const worker of this.activeWorkers) void worker.terminate();
    this.activeWorkers.clear();
  }

  private runWorker(groups: string[][]): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, {
        workerData: { groups }
      });
      this.activeWorkers.add(worker);
      let settled = false;
      const finish = (error?: Error, result?: string[][]): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.activeWorkers.delete(worker);
        void worker.terminate();
        if (error) reject(error);
        else resolve(result ?? []);
      };
      const timeout = setTimeout(() => {
        finish(new Error(`Alignment timed out after ${alignmentTimeoutMilliseconds} ms.`));
      }, alignmentTimeoutMilliseconds);

      worker.once("message", (message: WorkerResponse) => {
        if (message.error) finish(new Error(message.error));
        else finish(undefined, message.alignedGroups ?? []);
      });
      worker.once("error", (error) => finish(error));
      worker.once("exit", (code) => {
        if (code !== 0) finish(new Error(`Alignment worker exited with code ${code}.`));
      });
    });
  }
}

function toTracks(
  sequences: AlignmentSequence[],
  alignedSequences: string[]
): AlignmentResult["tracks"] {
  return sequences.map((sequence, index) => ({
    sequenceData: sequence,
    alignmentData: {
      id: sequence.id,
      name: sequence.name,
      sequence: alignedSequences[index] ?? sequence.sequence
    },
    ...(sequence.chromatogramData ? { chromatogramData: sequence.chromatogramData } : {})
  }));
}

function trimChromatogramSequence(sequence: AlignmentSequence): AlignmentSequence {
  const quality = sequence.chromatogramData?.qualNums;
  if (!Array.isArray(quality) || !quality.every((value) => typeof value === "number")) return sequence;
  const { start, end } = mottTrim(quality);
  if (start === 0 && end === sequence.sequence.length - 1) return sequence;
  const chromatogramData = { ...sequence.chromatogramData };
  for (const key of ["baseCalls", "basePos", "qualNums"]) {
    const value = chromatogramData[key];
    if (Array.isArray(value)) chromatogramData[key] = value.slice(start, end + 1);
  }
  return {
    ...sequence,
    sequence: sequence.sequence.slice(start, end + 1),
    chromatogramData
  };
}

export function mottTrim(quality: number[]): { start: number; end: number } {
  const cutoff = 0.05;
  let bestScore = 0;
  let runningScore = 0;
  let candidateStart = 0;
  let bestStart = 0;
  let bestEnd = Math.max(0, quality.length - 1);

  quality.forEach((score, index) => {
    const errorProbability = 10 ** (-score / 10);
    runningScore += cutoff - errorProbability;
    if (runningScore < 0) {
      runningScore = 0;
      candidateStart = index + 1;
    } else if (runningScore > bestScore) {
      bestScore = runningScore;
      bestStart = candidateStart;
      bestEnd = index;
    }
  });
  return { start: bestStart, end: bestEnd };
}
