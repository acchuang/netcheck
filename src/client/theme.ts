import { t, onLocaleChange } from "./i18n.ts";

// Two looks: the wall, and a high-contrast variant of it for accessibility.
// Any older saved value (dark, light, nord...) falls back to the wall.
type ThemeId = "wall" | "contrast";

// Must match the inline script in index.html.
const STORAGE_KEY = "netcheck-theme";

let current: ThemeId = "wall";
const themeChangeListeners: (() => void)[] = [];

export function onThemeChange(cb: () => void): void {
  themeChangeListeners.push(cb);
}

function apply(): void {
  document.documentElement.setAttribute("data-theme", current);
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(current === "contrast"));
  btn.setAttribute("aria-label", t("theme.contrast"));
  btn.title = t("theme.contrast");
}

export function initTheme(): void {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "contrast") current = "contrast";
  } catch {
    /* private mode */
  }
  apply();

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    current = current === "contrast" ? "wall" : "contrast";
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch {
      /* private mode */
    }
    apply();
    themeChangeListeners.forEach((cb) => cb());
  });

  onLocaleChange(apply);
}
