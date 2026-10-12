import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { preferencesPatchSchema, type AppPreferences } from "@ove/contracts";

const defaultPreferences: AppPreferences = {
  theme: "system",
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
      return { ...defaultPreferences, ...sanitizeStoredPreferences(JSON.parse(contents)) };
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

/**
 * Keeps only recognised values from disk. Files written before the theme
 * preference existed stored a boolean `isDarkMode`; `false` was the default and
 * cannot be told apart from "never chosen", so only `true` is kept as an explicit choice.
 */
function sanitizeStoredPreferences(stored: unknown): Partial<AppPreferences> {
  if (typeof stored !== "object" || stored === null) return {};
  const { isDarkMode, ...rest } = stored as Record<string, unknown>;
  const result: Partial<AppPreferences> = {};
  for (const [key, value] of Object.entries(rest)) {
    const parsed = preferencesPatchSchema.safeParse({ [key]: value });
    if (parsed.success) Object.assign(result, parsed.data);
  }
  if (!result.theme && isDarkMode === true) result.theme = "dark";
  return result;
}
