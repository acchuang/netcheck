import type { SpeedTestResults } from "./speed-test";
import { SpeedTest } from "./speed-test";

interface Snapshot {
  ts: number;
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  colo: string | null;
}

const KEY = "netcheck-snapshots";
const MAX = 20;

export function initSnapshots(): void {
  const saveBtn = document.getElementById("snapshot-save-btn")!;
  saveBtn.addEventListener("click", saveSnapshot);

  const clearBtn = document.getElementById("snapshot-clear-btn")!;
  clearBtn.addEventListener("click", clearSnapshots);

  renderSnapshotHistory();
}

export function enableSaveButton(): void {
  const btn = document.getElementById("snapshot-save-btn") as HTMLButtonElement | null;
  if (btn) btn.disabled = false;
}

function loadSnapshots(): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function persist(snapshots: Snapshot[]): void {
  localStorage.setItem(KEY, JSON.stringify(snapshots.slice(-MAX)));
}

function saveSnapshot(): void {
  const r = SpeedTest.results;
  if (r.download === null && r.upload === null && r.latency === null) return;
  const snapshots = loadSnapshots();
  snapshots.push({
    ts: Date.now(),
    download: r.download,
    upload: r.upload,
    latency: r.latency,
    jitter: r.jitter,
    colo: r.colo,
  });
  persist(snapshots);
  renderSnapshotHistory();
}

function clearSnapshots(): void {
  localStorage.removeItem(KEY);
  renderSnapshotHistory();
}

function fmtDelta(cur: number | null, prev: number | null, unit: string, lowerBetter = false): string {
  if (cur === null || prev === null) return `—`;
  const d = cur - prev;
  if (Math.abs(d) < 0.05) return `<span class="snap-delta same">±0 ${unit}</span>`;
  const good = lowerBetter ? d < 0 : d > 0;
  const sign = d > 0 ? "+" : "";
  const cls = good ? "good" : "bad";
  return `<span class="snap-delta ${cls}">${sign}${d.toFixed(1)} ${unit}</span>`;
}

function renderSnapshotHistory(): void {
  const section = document.getElementById("snapshot-section")!;
  const list = document.getElementById("snapshot-list")!;
  const snapshots = loadSnapshots();

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
      const prev = snapshots.length - 1 - i > 0 ? snapshots[snapshots.length - 2 - i] : null;
      const isLatest = i === 0;

      const dlDelta = isLatest && prev ? fmtDelta(s.download, prev.download, "Mbps") : "";
      const ulDelta = isLatest && prev ? fmtDelta(s.upload, prev.upload, "Mbps") : "";
      const latDelta = isLatest && prev ? fmtDelta(s.latency, prev.latency, "ms", true) : "";

      return `<div class="snap-row${isLatest ? " latest" : ""}">
        <span class="snap-time">${time}</span>
        <span class="snap-val">${SpeedTest.formatSpeed(s.download)} ${dlDelta}</span>
        <span class="snap-val">${SpeedTest.formatSpeed(s.upload)} ${ulDelta}</span>
        <span class="snap-val">${s.latency ?? "—"}ms ${latDelta}</span>
        <span class="snap-val snap-colo">${s.colo || "—"}</span>
      </div>`;
    })
    .join("");
}