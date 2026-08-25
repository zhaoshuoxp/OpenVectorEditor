import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DocumentRevision, SequenceDocument } from "@ove/contracts";

const maximumRevisions = 50;

export class HistoryService {
  public constructor(private readonly rootDirectory: string) {}

  public async list(filePath: string): Promise<DocumentRevision[]> {
    const historyPath = this.historyPath(filePath);
    try {
      const contents = await fs.readFile(historyPath, "utf8");
      const parsed = JSON.parse(contents) as DocumentRevision[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public async get(filePath: string, revisionId: string): Promise<DocumentRevision | null> {
    const revisions = await this.list(filePath);
    return revisions.find(({ id }) => id === revisionId) ?? null;
  }

  public async record(filePath: string, document: SequenceDocument): Promise<void> {
    const revisions = await this.list(filePath);
    revisions.unshift({
      id: randomUUID(),
      savedAt: new Date().toISOString(),
      filePath,
      document: structuredClone(document)
    });
    revisions.splice(maximumRevisions);

    await fs.mkdir(this.rootDirectory, { recursive: true });
    const historyPath = this.historyPath(filePath);
    const temporaryPath = `${historyPath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(revisions, null, 2), "utf8");
    await fs.rename(temporaryPath, historyPath);
  }

  private historyPath(filePath: string): string {
    const key = createHash("sha256").update(filePath).digest("hex");
    return path.join(this.rootDirectory, `${key}.json`);
  }
}
