export function animateNumber(el: HTMLElement, from: number, to: number, duration: number, formatter: (v: number) => string): void {
  const start = performance.now();
  const diff = to - from;
  if (Math.abs(diff) < 0.1) {
    el.textContent = formatter(to);
    return;
  }
  function tick(now: number): void {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - progress) * (1 - progress);
    el.textContent = formatter(from + diff * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function pulseValue(el: HTMLElement): void {
  el.classList.add("updating");
  setTimeout(() => el.classList.remove("updating"), 150);
}

export function setBadge(id: string, status: string, text: string): void {
  const el = document.getElementById(id)!;
  el.className = `status-badge ${status}`;
  el.textContent = text;
}

export function createCheckItem(status: string, label: string, value: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "dns-check-item fade-in";

  const iconSvg =
    status === "pass"
      ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
      : status === "fail"
        ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';

  div.innerHTML = `
    <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
    <span class="check-label">${label}</span>
    <span class="check-value">${value}</span>
  `;
  return div;
}

export function renderSkeletonRows(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="skeleton-row">
      <div class="skeleton skeleton-circle"></div>
      <div class="skeleton skeleton-text" style="flex:1"></div>
      <div class="skeleton skeleton-value"></div>
    </div>`
  ).join("");
}

export function setActiveGauge(phase: string): void {
  document.querySelectorAll(".speed-gauge").forEach((g, i) => {
    const phases = ["download", "upload", "latency", "jitter", "bufferbloat"];
    g.classList.toggle("active", phases[i] === phase);
  });
}

export function initTooltips(): void {
  const tip = document.createElement("div");
  tip.className = "tooltip";
  document.body.appendChild(tip);

  document.addEventListener("mouseenter", (e) => {
    const target = (e.target as HTMLElement).closest("[data-tooltip]") as HTMLElement | null;
    if (!target) return;
    tip.textContent = target.dataset.tooltip!;
    tip.classList.add("visible");

    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.top - tipRect.height - 6}px`;
  }, true);

  document.addEventListener("mouseleave", (e) => {
    if ((e.target as HTMLElement).closest("[data-tooltip]")) {
      tip.classList.remove("visible");
    }
  }, true);
}