import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { strings } from "./i18nStrings";

/**
 * Interface languages. English is the default and the source of every string: other languages
 * look the English text up in `strings` and fall back to English when there is no entry, so
 * scientific results, claims and catalog text (never listed there) always stay in English.
 */
export type Lang = "en" | "uz" | "ru";
export const LANGS: { code: Lang; short: string; name: string }[] = [
  { code: "en", short: "EN", name: "English" },
  { code: "uz", short: "UZ", name: "O‘zbekcha" },
  { code: "ru", short: "RU", name: "Русский" },
];
const KEY = "terrashift-lang";

export function translate(lang: Lang, text: string): string {
  if (lang === "en") return text;
  return strings[text]?.[lang === "uz" ? 0 : 1] || text;
}

function saved(): Lang {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "uz" || value === "ru") return value;
  } catch {
    // Storage can be blocked (private mode): English.
  }
  return "en";
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (text: string) => string }>({
  lang: "en",
  setLang: () => {},
  t: (text) => text,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(saved);
  const setLang = useCallback((l: Lang) => {
    set(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // Not remembered, but the switch still applies to this visit.
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t: (text: string) => translate(lang, text) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

export function LangSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <select
      className="lang-switch"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={t("Language")}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} lang={l.code} title={l.name}>
          {l.short}
        </option>
      ))}
    </select>
  );
}
