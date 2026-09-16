// What this page can actually learn about this device.
//
// The old "Fingerprint Protection" test asked a filter list whether a few
// fingerprinting *scripts* were blocked, which measured the list, not the
// browser: Tor Browser and Firefox with resistFingerprinting scored badly
// while a stock browser with a big list scored well. These checks call the
// APIs a fingerprinter would call and report what came back — no list, no
// network, and no bearing on the ad-block score, because "my browser is
// identifiable" and "my ad blocker works" are different questions and
// averaging them hides both.

export type SignalState = "protected" | "exposed" | "unknown";

export interface FingerprintSignal {
  id: string;
  state: SignalState;
  /** Raw value to show beside the verdict, e.g. "16 cores". */
  detail?: string;
}

/**
 * High-resolution time is the substrate under most behavioural
 * fingerprinting — audio, canvas and CPU timing attacks all need a clock
 * finer than the effect they measure. Browsers that resist it round the
 * clock: Firefox's resistFingerprinting to 100ms, Brave to 1ms, everyone
 * else leaves it at microseconds.
 */
export function classifyTimerPrecision(minDeltaMs: number): FingerprintSignal {
  if (!Number.isFinite(minDeltaMs) || minDeltaMs <= 0) return { id: "timer", state: "unknown" };
  const detail = `${minDeltaMs >= 1 ? minDeltaMs.toFixed(0) : minDeltaMs.toFixed(3)} ms`;
  return { id: "timer", state: minDeltaMs >= 1 ? "protected" : "exposed", detail };
}

/** Core count is stable, rarely changes, and splits the population hard. */
export function classifyConcurrency(value: number | undefined): FingerprintSignal {
  if (value === undefined) return { id: "cores", state: "protected" };
  // 2 is what resistFingerprinting reports; Brave caps the real number lower
  // than the machine's. Anything above 8 is the machine talking.
  return { id: "cores", state: value <= 2 ? "protected" : "exposed", detail: String(value) };
}

/** navigator.deviceMemory exists only in Chromium, and only to be read. */
export function classifyDeviceMemory(value: number | undefined): FingerprintSignal {
  if (value === undefined) return { id: "memory", state: "protected" };
  return { id: "memory", state: "exposed", detail: `${value} GB` };
}

/**
 * The unmasked WebGL renderer string ("ANGLE (NVIDIA GeForce RTX 4070...)")
 * is close to a hardware serial number. Browsers that resist it either drop
 * WEBGL_debug_renderer_info or return a generic string.
 */
export function classifyRenderer(renderer: string | null): FingerprintSignal {
  if (!renderer) return { id: "webgl", state: "protected" };
  const generic = /^(google inc\.?|intel inc\.?|apple gpu|webkit)/i.test(renderer.trim());
  return { id: "webgl", state: generic ? "protected" : "exposed", detail: renderer };
}

/** A precise timezone is a coarse location that survives a VPN. */
export function classifyTimezone(zone: string | null): FingerprintSignal {
  if (!zone) return { id: "timezone", state: "unknown" };
  return { id: "timezone", state: zone === "UTC" ? "protected" : "exposed", detail: zone };
}

/**
 * Two identical draws, two reads. Different bytes mean the browser is adding
 * per-read noise, so the canvas can't be used as a stable ID. Identical bytes
 * mean it can — which is the whole trick, and is what a stock browser does.
 */
export function classifyCanvas(first: string | null, second: string | null): FingerprintSignal {
  if (!first || !second) return { id: "canvas", state: "unknown" };
  return { id: "canvas", state: first === second ? "exposed" : "protected" };
}

export interface FingerprintSummary {
  protected: number;
  exposed: number;
  unknown: number;
  /** "strong" | "partial" | "none" — a label, never a number. */
  level: "strong" | "partial" | "none";
}

/**
 * Counts, plus a coarse label. Deliberately not a percentage: a fingerprint
 * is not an average of its parts — one strong signal identifies a browser on
 * its own, so "5 of 6 protected" would read as safety it doesn't have.
 */
export function summarizeFingerprint(signals: FingerprintSignal[]): FingerprintSummary {
  const count = (state: SignalState) => signals.filter((s) => s.state === state).length;
  const summary = { protected: count("protected"), exposed: count("exposed"), unknown: count("unknown") };
  const level = summary.exposed === 0 && summary.protected > 0
    ? "strong"
    : summary.protected > 0 ? "partial" : "none";
  return { ...summary, level };
}

// --- browser probes ---

/** Smallest non-zero gap the clock will show, in ms. */
function timerResolution(): number {
  let min = Infinity;
  for (let i = 0; i < 25_000 && min > 0.000_001; i++) {
    const a = performance.now();
    const b = performance.now();
    if (b > a) min = Math.min(min, b - a);
  }
  return min;
}

function canvasReadback(): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.textBaseline = "top";
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 90, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("NetCheck \u{1F5A5}", 2, 14);
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

function webglRenderer(): string | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (!gl || !ext) return null;
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "") || null;
  } catch {
    return null;
  }
}

/** Runs every probe. Synchronous work only — no network, nothing leaves the page. */
export function probeFingerprint(): FingerprintSignal[] {
  const nav = navigator as Navigator & { deviceMemory?: number };
  let zone: string | null = null;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    zone = null;
  }
  return [
    classifyTimerPrecision(timerResolution()),
    classifyCanvas(canvasReadback(), canvasReadback()),
    classifyRenderer(webglRenderer()),
    classifyConcurrency(nav.hardwareConcurrency),
    classifyDeviceMemory(nav.deviceMemory),
    classifyTimezone(zone),
  ];
}
