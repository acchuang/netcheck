import { isNetworkOnlyFiltering, type SplitScore } from "../shared/adblock-score.ts";
import type { Score } from "./adblock-test.ts";

// Positive-evidence-only blocker identification:
// - If too many probes timed out (score === null), report nothing rather than guessing.
// - If 0 probes were blocked, state "none detected" even on Brave (Shields may be down).
// - Only identify Brave Shields when navigator.brave is true AND blocking occurred.
// - Otherwise classify strictly by observed hosts vs. cosmetics evidence.
export interface BlockerFingerprint {
  kind: "none" | "brave" | "dns" | "extension" | "network";
  nameKey: string;
  confidence: "high" | "medium" | "low";
  sourceKey: string;
}

export async function detectBlocker(evidence: {
  score: Score;
  split: SplitScore;
}): Promise<BlockerFingerprint | null> {
  if (evidence.score.score === null) return null;

  if (evidence.score.blocked === 0) {
    return {
      kind: "none",
      nameKey: "adblock.fp.none",
      confidence: "high",
      sourceKey: "adblock.fp.src.probes",
    };
  }

  try {
    const nav = navigator as Navigator & { brave?: { isBrave: () => Promise<boolean> } };
    if (nav.brave && await nav.brave.isBrave()) {
      return {
        kind: "brave",
        nameKey: "adblock.fp.brave",
        confidence: "high",
        sourceKey: "adblock.fp.src.brave",
      };
    }
  } catch { /* ignore */ }

  if (isNetworkOnlyFiltering(evidence.split)) {
    return {
      kind: "dns",
      nameKey: "adblock.fp.dns",
      confidence: "medium",
      sourceKey: "adblock.fp.src.split",
    };
  }

  if (evidence.split.cosmetics.blocked > 0) {
    return {
      kind: "extension",
      nameKey: "adblock.fp.extension",
      confidence: "medium",
      sourceKey: "adblock.fp.src.cosmetic",
    };
  }

  return {
    kind: "network",
    nameKey: "adblock.fp.network",
    confidence: "low",
    sourceKey: "adblock.fp.src.network",
  };
}
