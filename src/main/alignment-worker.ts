import { parentPort, workerData } from "node:worker_threads";
import BioMSA from "biomsa";

interface AlignmentWorkerInput { groups: string[][] }

async function run(): Promise<void> {
  const input = workerData as AlignmentWorkerInput;
  const alignedGroups: string[][] = [];
  for (const group of input.groups) {
    alignedGroups.push(await BioMSA.align(group, { method: "auto", type: "auto" }));
  }
  parentPort?.postMessage({ alignedGroups });
}

void run().catch((error: unknown) => {
  parentPort?.postMessage({
    error: error instanceof Error ? error.message : String(error)
  });
});
