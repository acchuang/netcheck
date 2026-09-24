import { t, onLocaleChange } from "./i18n.ts";

// The DNS station: the path schematic, its scan cursor, and the readout panel.
// dns-check.ts decides what each hop and check *is*; this file only draws it.

export type HopId = "you" | "router" | "isp" | "resolver" | "edge";
/** "seen" is observed but not judged; "standby" is not observable at all. */
export type HopState = "pass" | "warn" | "fail" | "seen" | "standby";

const HOPS: HopId[] = ["you", "router", "isp", "resolver", "edge"];
// One step of the cursor. Long enough to read as travel, short enough that a
// hop whose data is already in never feels held back.
const STEP_MS = 280;

interface Lock {
  state: HopState;
  // Thunks so a locale switch can redraw without re-running anything.
  reading: () => string;
}

interface Condition {
  label: () => string;
  state: HopState;
}

const locks = new Map<HopId, Lock>();
let cursor = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let conditions: Condition[] = [];
let fastest: { name: string; latency: number } | null | undefined;

function stateTag(el: HTMLElement, state: HopState | "scan" | "complete"): void {
  el.textContent = t(`state.${state}`);
}

function drawHop(id: HopId): void {
  const hop = document.querySelector<HTMLElement>(`.hop[data-hop="${id}"]`);
  const lock = locks.get(id);
  if (!hop || !lock) return;
  hop.dataset.state = lock.state;
  hop.querySelector<HTMLElement>(".hop-reading")!.textContent = lock.reading();
  stateTag(hop.querySelector<HTMLElement>(".hop-state")!, lock.state);
}

function drawScanStatus(done: boolean): void {
  const el = document.getElementById("dns-scan-status");
  if (!el) return;
  el.className = `status-badge${done ? " done" : ""}`;
  stateTag(el, done ? "complete" : "scan");
}

// Advance the cursor over every hop whose reading has arrived, one step at a
// time and strictly in path order: a later hop that finished early waits for
// the cursor rather than lighting up out of sequence.
function step(): void {
  timer = null;
  const path = document.getElementById("dns-path");
  if (!path) return;
  const id = HOPS[cursor];
  path.style.setProperty("--i", String(Math.min(cursor, HOPS.length - 1)));

  if (!id) {
    path.dataset.scan = "done";
    drawScanStatus(true);
    return;
  }
  const hop = document.querySelector<HTMLElement>(`.hop[data-hop="${id}"]`)!;
  if (!locks.has(id)) {
    hop.dataset.state = "scan";
    stateTag(hop.querySelector<HTMLElement>(".hop-state")!, "scan");
    return;
  }
  drawHop(id);
  cursor++;
  timer = setTimeout(step, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : STEP_MS);
}

export function resetStation(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  locks.clear();
  cursor = 0;
  conditions = [];
  fastest = undefined;
  const path = document.getElementById("dns-path");
  if (path) path.dataset.scan = "running";
  document.querySelectorAll<HTMLElement>(".hop").forEach((hop) => {
    hop.dataset.state = "standby";
    hop.querySelector<HTMLElement>(".hop-reading")!.textContent = "—";
    hop.querySelector<HTMLElement>(".hop-state")!.textContent = "";
  });
  drawScanStatus(false);
  drawFastest();
  drawConditions();
  step();
}

export function lockHop(id: HopId, state: HopState, reading: () => string): void {
  locks.set(id, { state, reading });
  // Only nudge the cursor if it is parked on this hop; otherwise it is either
  // mid-travel (the timer will get here) or has not reached it yet.
  if (!timer && HOPS[cursor] === id) step();
}

export function setFastest(value: { name: string; latency: number } | null): void {
  fastest = value;
  drawFastest();
}

function drawFastest(): void {
  const value = document.getElementById("dns-fastest-value");
  const name = document.getElementById("dns-fastest-name");
  if (!value || !name) return;
  // Dashes, not zeros: a zero reads as a measurement.
  value.textContent = fastest ? String(Math.round(fastest.latency)) : "---";
  value.closest(".readout")?.classList.toggle("standby", fastest === null);
  name.textContent = fastest ? fastest.name : fastest === null ? t("station.fastestNone") : "";
}

export function setConditions(list: Condition[]): void {
  conditions = list;
  drawConditions();
}

function drawConditions(): void {
  const ul = document.getElementById("dns-conditions");
  if (!ul) return;
  ul.replaceChildren(
    ...conditions.map((c) => {
      const li = document.createElement("li");
      li.className = "condition";
      li.dataset.state = c.state;
      const label = document.createElement("span");
      label.className = "condition-label";
      label.textContent = c.label();
      const bar = document.createElement("span");
      bar.className = "condition-bar condition-lamp";
      bar.setAttribute("aria-hidden", "true");
      const tag = document.createElement("span");
      tag.className = "condition-state";
      stateTag(tag, c.state);
      li.replaceChildren(label, bar, tag);
      return li;
    })
  );
}

onLocaleChange(() => {
  HOPS.slice(0, cursor).forEach(drawHop);
  const path = document.getElementById("dns-path");
  if (path?.dataset.scan) drawScanStatus(path.dataset.scan === "done");
  const scanning = document.querySelector<HTMLElement>('.hop[data-state="scan"] .hop-state');
  if (scanning) stateTag(scanning, "scan");
  drawFastest();
  drawConditions();
});
