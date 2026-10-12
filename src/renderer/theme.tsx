import { useSyncExternalStore } from "react";
import { THEME_MODES, type ThemeMode } from "@ove/contracts";

const darkQuery = typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

function subscribe(onChange: () => void): () => void {
  darkQuery?.addEventListener("change", onChange);
  return () => darkQuery?.removeEventListener("change", onChange);
}

/** Live `prefers-color-scheme: dark`, which Electron derives from nativeTheme.themeSource. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribe, () => darkQuery?.matches ?? false);
}

const THEME_OPTIONS: Record<ThemeMode, { label: string; icon: string }> = {
  system: { label: "Use system theme", icon: "desktop" },
  light: { label: "Light theme", icon: "flash" },
  dark: { label: "Dark theme", icon: "moon" }
};

export function ThemeSwitch({ value, onChange }: { value: ThemeMode; onChange(theme: ThemeMode): void }) {
  return (
    <div className="themeSwitch" role="radiogroup" aria-label="Theme">
      {THEME_MODES.map((theme) => {
        const { label, icon } = THEME_OPTIONS[theme];
        return (
          <button
            key={theme}
            className="themeSwitch__option"
            type="button"
            role="radio"
            aria-checked={value === theme}
            aria-label={label}
            title={label}
            onClick={() => onChange(theme)}
          >
            <span className={`bp3-icon-standard bp3-icon-${icon}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
