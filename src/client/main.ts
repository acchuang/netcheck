import { initTheme } from "./theme";
import { initI18n } from "./i18n";
import "./app";

initTheme();
initI18n();

// ponytail: register SW only in production + browsers that support it
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
