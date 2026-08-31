// Two things get called "ad blocking" and they fail independently: stopping the
// request (hosts/DNS filtering — Pi-hole, NextDNS, a blocker's network rules)
// and hiding the box the ad would have filled (cosmetic filtering, which needs
// something running inside the page). Splitting them is the only way the score
// can tell a Pi-hole user "your network filtering works" instead of "install a
// blocker". Pure, so it is unit-testable.

/** Request-level probes: blocked here means the fetch never happened. */
export const NETWORK_TEST_TYPES = ["script", "image", "pixel"];
/** In-page probes: blocked here means CSS hid the element. */
export const COSMETIC_TEST_TYPES = ["element", "iframe"];

export interface ScoredTest {
  type: string;
  blocked: boolean;
}

export interface ScoredCategory {
  tests: ScoredTest[];
}

export interface SplitBucket {
  blocked: number;
  total: number;
  pct: number;
}

export interface SplitScore {
  hosts: SplitBucket;
  cosmetics: SplitBucket;
}

function bucket(tests: ScoredTest[]): SplitBucket {
  const blocked = tests.filter((test) => test.blocked).length;
  return {
    blocked,
    total: tests.length,
    pct: tests.length > 0 ? Math.round((blocked / tests.length) * 100) : 0,
  };
}

export function getSplitScore(results: ScoredCategory[]): SplitScore {
  const tests = results.flatMap((cat) => cat.tests);
  return {
    hosts: bucket(tests.filter((test) => NETWORK_TEST_TYPES.includes(test.type))),
    cosmetics: bucket(tests.filter((test) => COSMETIC_TEST_TYPES.includes(test.type))),
  };
}

/**
 * The Pi-hole/NextDNS shape: requests die on the network but nothing rewrites
 * the page. Telling this user to "install a blocker" is wrong — what they are
 * missing is only the cosmetic half.
 */
export function isNetworkOnlyFiltering(score: SplitScore): boolean {
  return score.hosts.total > 0 && score.cosmetics.total > 0 &&
    score.hosts.pct >= 70 && score.cosmetics.pct <= 30;
}
