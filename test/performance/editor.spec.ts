import { promises as fs } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { _electron as electron, expect, test } from "@playwright/test";

const workloads = [
  { name: "10kb", length: 10_000, annotations: 100 },
  { name: "100kb", length: 100_000, annotations: 1_000 },
  { name: "200kb-dense", length: 200_000, annotations: 2_000 }
];

const measurements: Array<{
  name: string;
  samples: number;
  medianLoadMilliseconds: number;
  p95LoadMilliseconds: number;
  medianUsedHeapBytes: number | null;
}> = [];
const sampleCount = Math.max(3, Number(process.env.OVE_PERFORMANCE_SAMPLES ?? 5));

test.afterAll(async () => {
  await fs.mkdir(path.resolve("test-results/performance"), { recursive: true });
  await fs.writeFile(
    path.resolve(`test-results/performance/${process.platform}.json`),
    JSON.stringify(measurements, null, 2),
    "utf8"
  );

  const baselinePath = path.resolve(`test/baseline/performance-${process.platform}.json`);
  try {
    const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8")) as typeof measurements;
    for (const measurement of measurements) {
      const previous = baseline.find(({ name }) => name === measurement.name);
      if (previous) {
        expect(measurement.medianLoadMilliseconds).toBeLessThanOrEqual(previous.medianLoadMilliseconds * 1.1);
        expect(measurement.p95LoadMilliseconds).toBeLessThanOrEqual(previous.p95LoadMilliseconds * 1.1);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
});

for (const workload of workloads) {
  test(`loads ${workload.name} within the compatibility budget`, async () => {
    const fixtureDirectory = path.resolve("test-results/performance-fixtures");
    await fs.mkdir(fixtureDirectory, { recursive: true });
    const fixturePath = path.join(fixtureDirectory, `${workload.name}.json`);
    const sequence = "ACGT".repeat(Math.ceil(workload.length / 4)).slice(0, workload.length);
    const features = Array.from({ length: workload.annotations }, (_, index) => ({
      id: `feature-${index}`,
      name: `Feature ${index}`,
      type: "misc_feature",
      start: (index * 83) % workload.length,
      end: Math.min(workload.length - 1, ((index * 83) % workload.length) + 30)
    }));
    await fs.writeFile(fixturePath, JSON.stringify({ name: workload.name, sequence, circular: true, features }), "utf8");

    const loadSamples: number[] = [];
    const heapSamples: number[] = [];
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const started = performance.now();
      const application = await electron.launch({
        args: [path.resolve("."), fixturePath, "--no-sandbox", `--user-data-dir=${path.resolve(`test-results/performance-user-data-${sample}`)}`]
      });
      const page = await application.firstWindow();
      await page.locator(".veEditor").waitFor({ state: "visible" });
      loadSamples.push(performance.now() - started);
      const usedHeapBytes = await page.evaluate(() => {
        const memory = (window.performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        return memory?.usedJSHeapSize ?? null;
      });
      if (usedHeapBytes !== null) heapSamples.push(usedHeapBytes);
      await application.close();
    }
    measurements.push({
      name: workload.name,
      samples: sampleCount,
      medianLoadMilliseconds: percentile(loadSamples, 0.5),
      p95LoadMilliseconds: percentile(loadSamples, 0.95),
      medianUsedHeapBytes: heapSamples.length ? percentile(heapSamples, 0.5) : null
    });
  });
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}
