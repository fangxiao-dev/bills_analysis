import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LANGUAGE_KEY } from "../i18n";

const navItems = [
  { labelKey: "app.nav.upload", to: "/" },
  { labelKey: "app.nav.review", to: "/manual-review" },
];

/**
 * Shared application frame with sidebar navigation.
 * @param {{ children: import("react").ReactNode }} props
 */
export function AppFrame({ children }) {
  const { t, i18n } = useTranslation();

  const onChangeLanguage = (nextLanguage) => {
    void i18n.changeLanguage(nextLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_KEY, nextLanguage);
    }
  };

  return (
    <main className="app-layout">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-icon">IH</span>
          <span>InvoiceHub</span>
        </div>
        <nav className="app-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `app-nav-item ${isActive ? "active" : ""}`}>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`app-nav-item ${i18n.language === "de" ? "active" : ""}`}
            onClick={() => onChangeLanguage("de")}
          >
            {t("app.language.de")}
          </button>
          <button
            type="button"
            className={`app-nav-item ${i18n.language === "en" ? "active" : ""}`}
            onClick={() => onChangeLanguage("en")}
          >
            {t("app.language.en")}
          </button>
          <button
            type="button"
            className={`app-nav-item ${i18n.language === "zh" ? "active" : ""}`}
            onClick={() => onChangeLanguage("zh")}
          >
            {t("app.language.zh")}
          </button>
        </div>
      </aside>
      <div className="app-main">{children}</div>
    </main>
  );
}
