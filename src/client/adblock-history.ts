// ponytail: mirrors snapshots.ts — adblock scores over time, color-coded deltas
import { AdBlockTest } from "./adblock-test.ts";
import { loadHistory, persistHistory } from "./ui-utils.ts";
import { t } from "./i18n.ts";

let clearTimer: number | null = null;

interface AdblockSnapshot {
  ts: number;
  score: number;
  blocked: number;
  total: number;
  cats: { name: string; pct: number }[];
}

const KEY = "netcheck-adblock-history";
const MAX = 20;

export function initAdblockHistory(): void {
  document.getElementById("adblock-history-save-btn")?.addEventListener("click", saveSnapshot);
  document.getElementById("adblock-history-clear-btn")?.addEventListener("click", clearSnapshots);
  renderHistory();
}

export function enableAdblockSaveButton(): void {
  const btn = document.getElementById("adblock-history-save-btn") as HTMLButtonElement | null;
  if (btn) btn.disabled = false;
}

function saveSnapshot(): void {
  const score = AdBlockTest.getScore();
  // An inconclusive run has nothing to diff against later — storing it would
  // put a network hiccup in the history as though it were a blocker change.
  if (score.total === 0 || score.score === null) return;
  const cats = AdBlockTest.results.map((c) => {
    const resolved = c.tests.filter((t) => !t.uncertain);
    const blocked = resolved.filter((t) => t.blocked).length;
    return { name: c.name, pct: resolved.length ? Math.round((blocked / resolved.length) * 100) : 0 };
  });
  const snapshots = loadHistory<AdblockSnapshot>(KEY);
  snapshots.push({ ts: Date.now(), score: score.score, blocked: score.blocked, total: score.total, cats });
  persistHistory(KEY, snapshots, MAX);
  renderHistory();
}

function clearSnapshots(): void {
  const btn = document.getElementById("adblock-history-clear-btn") as HTMLButtonElement | null;
  if (!btn) {
    localStorage.removeItem(KEY);
    renderHistory();
    return;
  }

  if (btn.dataset.confirming === "true") {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    btn.dataset.confirming = "false";
    btn.textContent = t("snap.clear");
    btn.classList.remove("btn-warn");
    localStorage.removeItem(KEY);
    renderHistory();
  } else {
    btn.dataset.confirming = "true";
    btn.textContent = t("history.confirmClear");
    btn.classList.add("btn-warn");
    clearTimer = window.setTimeout(() => {
      btn.dataset.confirming = "false";
      btn.textContent = t("snap.clear");
      btn.classList.remove("btn-warn");
      clearTimer = null;
    }, 4000);
  }
}

function fmtDelta(cur: number, prev: number | undefined, lowerBetter = false): string {
  if (prev === undefined) return "";
  const d = cur - prev;
  if (d === 0) return `<span class="snap-delta same">±0</span>`;
  const good = lowerBetter ? d < 0 : d > 0;
  const sign = d > 0 ? "+" : "";
  return `<span class="snap-delta ${good ? "good" : "bad"}">${sign}${d}</span>`;
}

// One scale for the score, the category bars, the breakdown rows and the
// history, so a bar and the number above it never disagree about how bad it is.
export function levelFor(pct: number): "pass" | "warn" | "fail" {
  return pct >= 80 ? "pass" : pct >= 20 ? "warn" : "fail";
}

function renderHistory(): void {
  const section = document.getElementById("adblock-history-section")!;
  const list = document.getElementById("adblock-history-list")!;
  const snapshots = loadHistory<AdblockSnapshot>(KEY);

  if (snapshots.length === 0) {
    section.hidden = true;
    list.innerHTML = "";
    return;
  }

  section.hidden = false;
  list.innerHTML = snapshots
    .slice()
    .reverse()
    .map((s, i) => {
      const date = new Date(s.ts);
      const time = date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const prev = i < snapshots.length - 1 ? snapshots[snapshots.length - 2 - i] : undefined;
      const isLatest = i === 0;
      const scoreDelta = isLatest ? fmtDelta(s.score, prev?.score) : "";

      return `<div class="snap-row${isLatest ? " latest" : ""}">
        <span class="snap-time">${time}</span>
        <span class="snap-val snap-score" data-state="${levelFor(s.score)}">${s.score}/100 ${scoreDelta}</span>
        <span class="snap-val">${s.blocked}/${s.total} ${isLatest ? fmtDelta(s.blocked, prev?.blocked) : ""}</span>
        <span class="snap-val snap-colo">${s.cats.map((c) => `${c.name.split(" ")[0]}:${c.pct}%`).join(" ")}</span>
      </div>`;
    })
    .join("");
}