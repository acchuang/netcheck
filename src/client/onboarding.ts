import { t } from "./i18n";

const STORAGE_KEY = "netcheck-onboarded";

function isOnboarded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch { /* ignore */ }
}

export function initOnboarding(): void {
  if (isOnboarded()) return;

  const banner = document.createElement("div");
  banner.className = "onboarding-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML = `
    <div class="onboarding-inner">
      <p class="onboarding-text"><strong>NetCheck</strong> — ${t("onboarding.text")}</p>
      <button class="onboarding-dismiss" aria-label="Dismiss">&times;</button>
    </div>
  `;

  const dismiss = banner.querySelector(".onboarding-dismiss")!;
  dismiss.addEventListener("click", () => {
    banner.classList.add("onboarding-exit");
    markOnboarded();
    banner.addEventListener("animationend", () => banner.remove());
  });

  const main = document.getElementById("main");
  if (main && main.firstChild) {
    main.insertBefore(banner, main.firstChild);
  } else if (main) {
    main.appendChild(banner);
  } else {
    document.body.insertBefore(banner, document.body.firstChild);
  }

  setTimeout(() => {
    if (document.body.contains(banner)) {
      banner.classList.add("onboarding-exit");
      markOnboarded();
      banner.addEventListener("animationend", () => banner.remove());
    }
  }, 12000);
}