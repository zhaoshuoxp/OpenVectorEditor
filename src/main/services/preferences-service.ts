import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppPreferences } from "@ove/contracts";

const defaultPreferences: AppPreferences = {
  isDarkMode: false,
  axisFontScalePercent: 100
};

export class PreferencesService {
  private readonly preferencesPath: string;

  public constructor(rootDirectory: string) {
    this.preferencesPath = path.join(rootDirectory, "preferences.json");
  }

  public async get(): Promise<AppPreferences> {
    try {
      const contents = await fs.readFile(this.preferencesPath, "utf8");
      return { ...defaultPreferences, ...(JSON.parse(contents) as Partial<AppPreferences>) };
    } catch {
      return { ...defaultPreferences };
    }
  }

  public async update(patch: Partial<AppPreferences>): Promise<AppPreferences> {
    const preferences = { ...(await this.get()), ...patch };
    await fs.mkdir(path.dirname(this.preferencesPath), { recursive: true });
    const temporaryPath = `${this.preferencesPath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(preferences, null, 2), "utf8");
    await fs.rename(temporaryPath, this.preferencesPath);
    return preferences;
  }
}
