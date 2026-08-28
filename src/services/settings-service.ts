/**
 * Central app settings: language, theme, notifications, premium, feature flags.
 * Components must never read or write global settings ad hoc.
 */

export interface AppSettings {
  /** UI language code (see src/i18n/languages.ts). Independent of currency. */
  language: string;
  /** True once the user picked a language manually — country no longer overrides it. */
  languageChosenManually: boolean;
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  featureFlags: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "sv",
  languageChosenManually: false,
  theme: "light",
  notificationsEnabled: false,
  featureFlags: {
    batterySimulation: false,
    hourlyData: false,
    advancedEconomics: false,
  },
};

const STORAGE_KEY = "solenergikollen.settings";

/** Storage access is isolated here — UI never touches localStorage directly. */
export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persisting settings is best-effort.
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
}
