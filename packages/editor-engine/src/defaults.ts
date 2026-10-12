/**
 * OVE reads some view settings from localStorage once, while its module is evaluated, and
 * writes them back whenever the user picks a value from the View menu. Seeding a key that is
 * still absent changes the default without overriding a size the user already chose.
 *
 * This module must be imported before "@teselagen/ove" so it runs first.
 */

/** Circular Label Size: OVE uses 8 for its "100%" entry; 10 is the "125%" entry. */
export const DEFAULT_CIRCULAR_LABEL_SIZE = 10;

function seedDefault(key: string, value: string): void {
  try {
    if (globalThis.localStorage?.getItem(key) === null) globalThis.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (privacy mode, non-browser test runs); OVE falls back to its own default.
  }
}

seedDefault("labelSize", String(DEFAULT_CIRCULAR_LABEL_SIZE));
