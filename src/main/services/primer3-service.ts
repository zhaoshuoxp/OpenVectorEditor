import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { App } from "electron";
import type { PrimerDesignRequest, PrimerDesignResult } from "@ove/contracts";

const primer3TimeoutMilliseconds = 30_000;

export class Primer3Service {
  private readonly activeProcesses = new Set<ChildProcessWithoutNullStreams>();

  public constructor(
    private readonly electronApp: App,
    private readonly applicationRoot: string
  ) {}

  public async design(request: PrimerDesignRequest): Promise<PrimerDesignResult> {
    const primer3Input = this.buildInput(request);
    const { stdout, stderr, binaryPath } = await this.run(primer3Input);
    return {
      ...parsePrimer3Output(stdout),
      binaryPath,
      primer3Input,
      stderr,
      rawOutput: stdout
    };
  }

  public cancelAll(): void {
    for (const child of this.activeProcesses) {
      child.kill();
    }
    this.activeProcesses.clear();
  }

  public buildInput(request: PrimerDesignRequest): string {
    const pickLeft = request.task === "both" || request.task === "forward";
    const pickRight = request.task === "both" || request.task === "reverse";
    const configPath = this.getConfigPath();
    const lines = [
      `SEQUENCE_ID=${request.sequenceId || "ove_primer_design"}`,
      `SEQUENCE_TEMPLATE=${request.sequence}`,
      "PRIMER_TASK=generic",
      `PRIMER_PICK_LEFT_PRIMER=${pickLeft ? 1 : 0}`,
      `PRIMER_PICK_RIGHT_PRIMER=${pickRight ? 1 : 0}`,
      "PRIMER_PICK_INTERNAL_OLIGO=0",
      "PRIMER_EXPLAIN_FLAG=1",
      `PRIMER_NUM_RETURN=${request.numReturn}`,
      `PRIMER_MIN_SIZE=${request.size.min}`,
      `PRIMER_OPT_SIZE=${request.size.opt}`,
      `PRIMER_MAX_SIZE=${request.size.max}`,
      `PRIMER_MIN_TM=${request.tm.min}`,
      `PRIMER_OPT_TM=${request.tm.opt}`,
      `PRIMER_MAX_TM=${request.tm.max}`,
      `PRIMER_MIN_GC=${request.gc.min}`,
      `PRIMER_OPT_GC_PERCENT=${request.gc.opt}`,
      `PRIMER_MAX_GC=${request.gc.max}`
    ];

    if (configPath) lines.push(`PRIMER_THERMODYNAMIC_PARAMETERS_PATH=${configPath}`);
    if (pickLeft && pickRight) lines.push(`PRIMER_PRODUCT_SIZE_RANGE=${request.productSizeRange}`);
    if (request.target) lines.push(`SEQUENCE_TARGET=${request.target.start},${request.target.length}`);
    if (request.includedRegion) {
      lines.push(
        `SEQUENCE_INCLUDED_REGION=${request.includedRegion.start},${request.includedRegion.length}`
      );
    }
    lines.push("=");
    return `${lines.join("\n")}\n`;
  }

  private getBinaryCandidates(): string[] {
    const executableName = process.platform === "win32" ? "primer3_core.exe" : "primer3_core";
    const platformArchitecture = `${process.platform}-${process.arch}`;
    const resourceRoot = this.electronApp.isPackaged
      ? process.resourcesPath
      : this.applicationRoot;
    return [
      process.env.PRIMER3_CORE_PATH,
      path.join(resourceRoot, "bin", "primer3", platformArchitecture, executableName),
      path.join(resourceRoot, "bin", executableName),
      path.join("/opt/homebrew/bin", executableName),
      path.join("/usr/local/bin", executableName),
      executableName
    ].filter((candidate): candidate is string => Boolean(candidate));
  }

  private getConfigPath(): string | undefined {
    const platformArchitecture = `${process.platform}-${process.arch}`;
    const resourceRoot = this.electronApp.isPackaged
      ? process.resourcesPath
      : this.applicationRoot;
    return [
      process.env.PRIMER3_CONFIG_PATH,
      path.join(resourceRoot, "bin", "primer3", platformArchitecture, "primer3_config"),
      path.join(resourceRoot, "bin", "primer3_config"),
      "/opt/homebrew/share/primer3/primer3_config",
      "/usr/local/share/primer3/primer3_config",
      "/usr/share/primer3/primer3_config"
    ].find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
  }

  private run(input: string): Promise<{ stdout: string; stderr: string; binaryPath: string }> {
    const candidates = this.getBinaryCandidates();
    return new Promise((resolve, reject) => {
      const tryCandidate = (candidateIndex: number): void => {
        const candidate = candidates[candidateIndex];
        if (!candidate) {
          reject(new Error("primer3_core was not found for this platform and architecture."));
          return;
        }

        const child = spawn(candidate, [], { stdio: ["pipe", "pipe", "pipe"] });
        this.activeProcesses.add(child);
        let stdout = "";
        let stderr = "";
        let spawned = false;
        let settled = false;

        const timeout = setTimeout(() => {
          child.kill();
          finish(new Error(`primer3_core timed out after ${primer3TimeoutMilliseconds} ms.`));
        }, primer3TimeoutMilliseconds);

        const finish = (
          error?: Error,
          result?: { stdout: string; stderr: string; binaryPath: string }
        ): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.activeProcesses.delete(child);
          if (error) reject(error);
          else if (result) resolve(result);
        };

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.stdin.on("error", (error: NodeJS.ErrnoException) => {
          // A process that cannot start can close stdin before Node finishes the write.
          // Its close event contains the useful stderr; EPIPE must not become uncaught.
          if (error.code !== "EPIPE") finish(error);
        });
        child.on("spawn", () => {
          spawned = true;
          child.stdin.end(input);
        });
        child.on("error", (error: NodeJS.ErrnoException) => {
          clearTimeout(timeout);
          this.activeProcesses.delete(child);
          if (!spawned && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
            settled = true;
            tryCandidate(candidateIndex + 1);
            return;
          }
          finish(error);
        });
        child.on("close", (code) => {
          if (settled) return;
          if (code === 0) finish(undefined, { stdout, stderr, binaryPath: candidate });
          else finish(new Error(stderr || `primer3_core exited with code ${String(code)}.`));
        });
      };
      tryCandidate(0);
    });
  }
}

export function parsePrimer3Output(output: string): Omit<
  PrimerDesignResult,
  "binaryPath" | "primer3Input" | "stderr" | "rawOutput"
> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    if (!line || line === "=") continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex > -1) values[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }

  const resultCount = Math.max(
    Number(values.PRIMER_PAIR_NUM_RETURNED ?? 0),
    Number(values.PRIMER_LEFT_NUM_RETURNED ?? 0),
    Number(values.PRIMER_RIGHT_NUM_RETURNED ?? 0)
  );
  const results: PrimerDesignResult["results"] = [];
  for (let index = 0; index < resultCount; index += 1) {
    const [leftStart, leftLength] = (values[`PRIMER_LEFT_${index}`] ?? "").split(",").map(Number);
    const [rightStart, rightLength] = (values[`PRIMER_RIGHT_${index}`] ?? "").split(",").map(Number);
    const forwardSequence = values[`PRIMER_LEFT_${index}_SEQUENCE`];
    const reverseSequence = values[`PRIMER_RIGHT_${index}_SEQUENCE`];
    results.push({
      index: index + 1,
      ...(values[`PRIMER_PAIR_${index}_PENALTY`]
        ? { penalty: values[`PRIMER_PAIR_${index}_PENALTY`] }
        : {}),
      ...(values[`PRIMER_PAIR_${index}_PRODUCT_SIZE`]
        ? { productSize: values[`PRIMER_PAIR_${index}_PRODUCT_SIZE`] }
        : {}),
      forward: forwardSequence
        ? {
            sequence: forwardSequence,
            ...(values[`PRIMER_LEFT_${index}_TM`] ? { tm: values[`PRIMER_LEFT_${index}_TM`] } : {}),
            ...(values[`PRIMER_LEFT_${index}_GC_PERCENT`] ? { gc: values[`PRIMER_LEFT_${index}_GC_PERCENT`] } : {}),
            ...(typeof leftStart === "number" && Number.isFinite(leftStart) ? { start: leftStart + 1 } : {}),
            ...(typeof leftLength === "number" && Number.isFinite(leftLength) ? { length: leftLength } : {})
          }
        : null,
      reverse: reverseSequence
        ? {
            sequence: reverseSequence,
            ...(values[`PRIMER_RIGHT_${index}_TM`] ? { tm: values[`PRIMER_RIGHT_${index}_TM`] } : {}),
            ...(values[`PRIMER_RIGHT_${index}_GC_PERCENT`] ? { gc: values[`PRIMER_RIGHT_${index}_GC_PERCENT`] } : {}),
            ...(typeof rightStart === "number" && Number.isFinite(rightStart) ? { start: rightStart + 1 } : {}),
            ...(typeof rightLength === "number" && Number.isFinite(rightLength) ? { length: rightLength } : {})
          }
        : null
    });
  }

  return {
    values,
    results,
    ...(values.PRIMER_ERROR ? { error: values.PRIMER_ERROR } : {}),
    explain: {
      ...(values.PRIMER_PAIR_EXPLAIN ? { pair: values.PRIMER_PAIR_EXPLAIN } : {}),
      ...(values.PRIMER_LEFT_EXPLAIN ? { left: values.PRIMER_LEFT_EXPLAIN } : {}),
      ...(values.PRIMER_RIGHT_EXPLAIN ? { right: values.PRIMER_RIGHT_EXPLAIN } : {})
    }
  };
}
