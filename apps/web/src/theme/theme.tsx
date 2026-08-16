import { createContext, useContext, useEffect, useMemo, useState, type JSX, type PropsWithChildren } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const themeStorageKey = 'nfcompra.theme';
export const legacyThemeStorageKey = 'nfcompra.landing-theme';
export const themeOptions: ThemePreference[] = ['system', 'dark', 'light'];

export function readStoredTheme(): ThemePreference {
  let preference: ThemePreference = 'system';
  try {
    const stored = localStorage.getItem(themeStorageKey);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      preference = stored;
    } else {
      const legacy = localStorage.getItem(legacyThemeStorageKey);
      if (legacy === 'light' || legacy === 'dark' || legacy === 'system') {
        preference = legacy;
        localStorage.setItem(themeStorageKey, legacy);
        localStorage.removeItem(legacyThemeStorageKey);
      }
    }
  } catch {
    // Storage can be blocked (private browsing); system theme still works.
  }
  return preference;
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference !== 'system') return preference;
  return systemDark ? 'dark' : 'light';
}

function applyDocumentTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

interface ThemeContextValue {
  themePreference: ThemePreference;
  theme: ResolvedTheme;
  setThemePreference(preference: ThemePreference): void;
  cycleTheme(): void;
  themeLabel: string;
  themeIcon: string;
  themeActionLabel: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(readStoredTheme);
  const [systemDark, setSystemDark] = useState<boolean>(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const theme = resolveTheme(themePreference, systemDark);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    try {
      if (themePreference === 'system') localStorage.removeItem(themeStorageKey);
      else localStorage.setItem(themeStorageKey, themePreference);
      localStorage.removeItem(legacyThemeStorageKey);
    } catch {
      // Ignore storage failures; theme still works for the session.
    }
  }, [themePreference]);

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => {
    const nextThemePreference = themeOptions[(themeOptions.indexOf(themePreference) + 1) % themeOptions.length];
    const themeLabel = themePreference === 'system' ? `Tema: sistema (${theme === 'dark' ? 'oscuro' : 'claro'})` : `Tema: ${themePreference === 'dark' ? 'oscuro' : 'claro'}`;
    const themeIcon = themePreference === 'system' ? '◐' : themePreference === 'dark' ? '☾' : '☀';
    const themeActionLabel = `Cambiar a ${nextThemePreference === 'system' ? 'sistema' : nextThemePreference === 'dark' ? 'oscuro' : 'claro'}`;
    return {
      themePreference,
      theme,
      setThemePreference: setThemePreferenceState,
      cycleTheme: () => setThemePreferenceState((current) => themeOptions[(themeOptions.indexOf(current) + 1) % themeOptions.length]),
      themeLabel,
      themeIcon,
      themeActionLabel,
    };
  }, [themePreference, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme debe usarse dentro de ThemeProvider.');
  return value;
}

export function ThemeToggle(): JSX.Element {
  const { themeLabel, themeActionLabel, themeIcon, cycleTheme } = useTheme();
  return <button className="public-landing__theme-toggle" type="button" aria-label={`${themeLabel}. ${themeActionLabel}`} title={themeLabel} onClick={cycleTheme}>
    <span aria-hidden="true">{themeIcon}</span>
  </button>;
}
