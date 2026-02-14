import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";

const LANGUAGE_KEY = "app.lang";

/**
 * Read initial language from localStorage; default to German.
 */
function getInitialLanguage() {
  const saved = typeof window !== "undefined" ? window.localStorage.getItem(LANGUAGE_KEY) : null;
  return saved === "en" || saved === "de" ? saved : "de";
}

i18n.use(initReactI18next).init({
  lng: getInitialLanguage(),
  fallbackLng: "en",
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  interpolation: {
    escapeValue: false,
  },
});

export { LANGUAGE_KEY };
export default i18n;
