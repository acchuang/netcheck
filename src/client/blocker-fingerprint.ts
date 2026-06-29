// Feature 3: deep blocker identification.
// Reliable signals: Brave (navigator.brave), browser built-in tracking protection.
// Best-effort: probe known extension web-accessible resources (time-boxed).
// Falls back to inferring from filter-list detection results.
export interface BlockerFingerprint {
  name: string;
  confidence: "high" | "medium" | "low";
  source: string; // how it was detected
}

export async function detectBlocker(filterListNames: string[]): Promise<BlockerFingerprint> {
  // 1. Brave Shields — reliable via navigator.brave
  try {
    const nav = navigator as Navigator & { brave?: { isBrave: () => Promise<boolean> } };
    if (nav.brave && await nav.brave.isBrave()) {
      return { name: "Brave Shields", confidence: "high", source: "navigator.brave" };
    }
  } catch { /* ignore */ }

  // 2. Best-effort extension probes — web-accessible resources (time-boxed 1.2s)
  const probe = async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(1200), cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  };

  // Known Chrome Web Store IDs (stable). uBO: cjpalhdlnbpafiamejdnhcphjbkeiagm
  // ponytail: these may 404 across origins, hence "low" confidence; best-effort only
  const uboOk = await probe("chrome-extension://cjpalhdlnbpafiamejdnhcphjbkeiagm/img/icon_64.png");
  if (uboOk) return { name: "uBlock Origin", confidence: "high", source: "extension resource" };

  // 3. Infer from detected filter lists
  const has = (n: string) => filterListNames.some((f) => f.toLowerCase().includes(n.toLowerCase()));
  if (has("uBlock Filters")) return { name: "uBlock Origin / uBlock", confidence: "medium", source: "filter list inference" };
  if (has("AdGuard")) return { name: "AdGuard", confidence: "medium", source: "filter list inference" };
  if (has("EasyList") && !has("uBlock") && !has("AdGuard")) {
    return { name: "Adblock Plus / generic EasyList blocker", confidence: "medium", source: "filter list inference" };
  }

  // 4. No lists detected + tests show blocking → likely browser-native (Firefox ETP / Safari ITP)
  return { name: "Browser-native / unknown", confidence: "low", source: "fallback" };
}