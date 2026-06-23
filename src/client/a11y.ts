// Accessibility utilities

let liveRegion: HTMLElement | null = null;
let statusRegion: HTMLElement | null = null;

function ensureLiveRegion(): HTMLElement {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('role', 'status');
    liveRegion.className = 'sr-only';
    document.body.appendChild(liveRegion);
  }
  return liveRegion;
}

function ensureStatusRegion(): HTMLElement {
  if (!statusRegion) {
    statusRegion = document.createElement('div');
    statusRegion.setAttribute('aria-live', 'polite');
    statusRegion.setAttribute('aria-atomic', 'false');
    statusRegion.setAttribute('role', 'log');
    statusRegion.className = 'sr-only';
    document.body.appendChild(statusRegion);
  }
  return statusRegion;
}

/** Announce a message to screen readers (polite, replaces previous). */
export function announce(msg: string): void {
  const el = ensureLiveRegion();
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = msg;
  });
}

/** Log a progress update to screen readers (polite, appends to log). */
export function announceProgress(msg: string): void {
  const el = ensureStatusRegion();
  const p = document.createElement('p');
  p.textContent = msg;
  el.appendChild(p);
  while (el.childNodes.length > 3) {
    el.removeChild(el.firstChild!);
  }
}

/** Clear all announcements. */
export function clearAnnouncements(): void {
  if (liveRegion) liveRegion.textContent = '';
  if (statusRegion) statusRegion.innerHTML = '';
}

/** Move focus to a section for keyboard users. */
export function focusSection(id: string): void {
  const section = document.getElementById(id);
  if (!section) return;
  section.setAttribute('tabindex', '-1');
  section.focus({ preventScroll: true });
  section.addEventListener('blur', () => section.removeAttribute('tabindex'), { once: true });
}

/** Focus the run button of the active section. */
export function focusRunButton(sectionId: string): void {
  const btnMap: Record<string, string> = {
    dns: 'dns-lookup-btn',
    speed: 'speed-start-btn',
    security: 'sec-target-btn',
    privacy: 'pb-fp-start-btn',
    ai: 'ai-analyze-btn',
  };
  const id = btnMap[sectionId];
  if (id) document.getElementById(id)?.focus();
}

/** Keyboard shortcut map. */
const tabShortcuts: Record<string, string> = {
  '1': 'overview',
  '2': 'dns',
  '3': 'speed',
  '4': 'security',
  '5': 'privacy',
  '6': 'ai',
};

function hideExport(): void {
  const menu = document.getElementById('export-menu');
  if (menu) menu.classList.remove('open');
}

function hideLangMenu(): void {
  const menu = document.getElementById('lang-menu');
  if (menu) menu.classList.remove('open');
}

export function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Escape closes menus and focuses nothing
    if (e.key === 'Escape') {
      hideExport();
      hideLangMenu();
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }

    // Only global shortcuts when not typing in inputs
    const target = e.target as HTMLElement;
    if (target.matches('input, textarea, select, [contenteditable]')) return;

    // Tab switching: 1–6
    if (tabShortcuts[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      activateTab(tabShortcuts[e.key]);
      return;
    }

    // Run active tab's test: r/R
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const activeTab = document.querySelector('.tab-link.active')?.getAttribute('data-tab');
      if (activeTab) focusRunButton(activeTab);
      return;
    }

    // Previous / Next tab: ← / →
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('.tab-link[data-tab]'));
      const activeIdx = tabs.findIndex((t) => t.classList.contains('active'));
      if (activeIdx === -1) return;
      const nextIdx =
        e.key === 'ArrowLeft'
          ? (activeIdx - 1 + tabs.length) % tabs.length
          : (activeIdx + 1) % tabs.length;
      activateTab(tabs[nextIdx].dataset.tab!);
    }
  });
}

function activateTab(tabId: string): void {
  const link = document.querySelector<HTMLElement>(`.tab-link[data-tab="${tabId}"]`);
  if (link) link.click();
}
