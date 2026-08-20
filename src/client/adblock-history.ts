// ponytail: mirrors snapshots.ts — adblock scores over time, color-coded deltas
import { AdBlockTest } from "./adblock-test";
import { loadHistory, persistHistory } from "./ui-utils";

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
  if (score.total === 0) return;
  const cats = AdBlockTest.results.map((c) => {
    const blocked = c.tests.filter((t) => t.blocked).length;
    return { name: c.name, pct: c.tests.length ? Math.round((blocked / c.tests.length) * 100) : 0 };
  });
  const snapshots = loadHistory<AdblockSnapshot>(KEY);
  snapshots.push({ ts: Date.now(), score: score.score, blocked: score.blocked, total: score.total, cats });
  persistHistory(KEY, snapshots, MAX);
  renderHistory();
}

function clearSnapshots(): void {
  localStorage.removeItem(KEY);
  renderHistory();
}

function fmtDelta(cur: number, prev: number | undefined, lowerBetter = false): string {
  if (prev === undefined) return "";
  const d = cur - prev;
  if (d === 0) return `<span class="snap-delta same">±0</span>`;
  const good = lowerBetter ? d < 0 : d > 0;
  const sign = d > 0 ? "+" : "";
  return `<span class="snap-delta ${good ? "good" : "bad"}">${sign}${d}</span>`;
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
      const color = s.score >= 80 ? "var(--emerald)" : s.score >= 50 ? "var(--accent)" : s.score >= 20 ? "var(--amber)" : "var(--red)";

      return `<div class="snap-row${isLatest ? " latest" : ""}">
        <span class="snap-time">${time}</span>
        <span class="snap-val" style="color:${color};font-weight:600">${s.score}/100 ${scoreDelta}</span>
        <span class="snap-val">${s.blocked}/${s.total} ${isLatest ? fmtDelta(s.blocked, prev?.blocked) : ""}</span>
        <span class="snap-val snap-colo">${s.cats.map((c) => `${c.name.split(" ")[0]}:${c.pct}%`).join(" ")}</span>
      </div>`;
    })
    .join("");
}