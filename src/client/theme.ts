import { t, onLocaleChange } from "./i18n.ts";

// Two looks: the wall, and a high-contrast variant of it for accessibility.
// Any older saved value (dark, light, nord...) falls back to the wall.
type ThemeId = "wall" | "contrast";

// Must match the inline script in index.html.
const STORAGE_KEY = "netcheck-theme";

let current: ThemeId = "wall";

function apply(): void {
  document.documentElement.setAttribute("data-theme", current);
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(current === "contrast"));
  btn.setAttribute("aria-label", t("theme.contrast"));
  btn.title = t("theme.contrast");
}

export function initTheme(): void {
  if (localStorage.getItem(STORAGE_KEY) === "contrast") current = "contrast";
  apply();

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    current = current === "contrast" ? "wall" : "contrast";
    localStorage.setItem(STORAGE_KEY, current);
    apply();
  });

  onLocaleChange(apply);
}
