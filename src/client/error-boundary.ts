const TOAST_DURATION = 8000;
const MAX_TOASTS = 3;

let toastContainer: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "error-toast-container";
    toastContainer.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:380px;";
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function createToast(moduleName: string, error: Error): HTMLDivElement {
  const toast = document.createElement("div");
  toast.className = "error-toast";
  toast.setAttribute("role", "alert");

  const message = error.message || String(error);
  toast.innerHTML = `
    <div class="error-toast-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <div class="error-toast-body">
      <div class="error-toast-title">${escapeHtml(moduleName)} failed to load</div>
      <div class="error-toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="error-toast-close" aria-label="Dismiss">&times;</button>
  `;

  const closeBtn = toast.querySelector(".error-toast-close")!;
  closeBtn.addEventListener("click", () => dismiss(toast));

  setTimeout(() => dismiss(toast), TOAST_DURATION);

  return toast;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function dismiss(toast: HTMLDivElement): void {
  toast.classList.add("error-toast-exit");
  toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  setTimeout(() => toast.remove(), 300);
}

function trimToasts(container: HTMLDivElement): void {
  const toasts = container.querySelectorAll(".error-toast");
  while (toasts.length > MAX_TOASTS) {
    toasts[0].remove();
  }
}

export function safeInit(moduleName: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[${moduleName}]`, error);
    const container = getContainer();
    container.appendChild(createToast(moduleName, error));
    trimToasts(container);
  }
}

export function safeInitAsync(moduleName: string, fn: () => Promise<void>): void {
  fn().catch((e) => {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[${moduleName}]`, error);
    const container = getContainer();
    container.appendChild(createToast(moduleName, error));
    trimToasts(container);
  });
}
