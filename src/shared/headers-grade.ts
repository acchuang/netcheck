export type HeaderStatus = "pass" | "warn" | "fail" | "info";

export interface HeaderSpec {
  key: string;
  name: string;
  desc: string;
  graded: boolean;
}

export interface HeaderCheckResult {
  name: string;
  key: string;
  desc: string;
  value: string | null;
  present: boolean;
  graded: boolean;
  status: HeaderStatus;
  reasonKey?: string;
  reasonArg?: string;
}

export interface HeadersScore {
  present: number;
  passed: number;
  weak: number;
  missing: number;
  total: number;
}

export interface HeadersEvaluation {
  grade: "A" | "B" | "C" | "D" | "F";
  score: HeadersScore;
  checks: HeaderCheckResult[];
}

export const SECURITY_HEADERS: readonly HeaderSpec[] = [
  {
    key: "strict-transport-security",
    name: "Strict-Transport-Security (HSTS)",
    desc: "Forces HTTPS connections, preventing downgrade attacks",
    graded: true,
  },
  {
    key: "content-security-policy",
    name: "Content-Security-Policy (CSP)",
    desc: "Controls which resources the browser can load, mitigating XSS",
    graded: true,
  },
  {
    key: "x-content-type-options",
    name: "X-Content-Type-Options",
    desc: "Prevents MIME type sniffing attacks",
    graded: true,
  },
  {
    key: "x-frame-options",
    name: "X-Frame-Options",
    desc: "Prevents clickjacking by controlling iframe embedding",
    graded: true,
  },
  {
    key: "referrer-policy",
    name: "Referrer-Policy",
    desc: "Controls how much referrer information is sent with requests",
    graded: true,
  },
  {
    key: "permissions-policy",
    name: "Permissions-Policy",
    desc: "Controls which browser features the page can use",
    graded: true,
  },
  {
    key: "cross-origin-opener-policy",
    name: "Cross-Origin-Opener-Policy (COOP)",
    desc: "Isolates browsing context from cross-origin popups",
    graded: true,
  },
  {
    key: "cross-origin-embedder-policy",
    name: "Cross-Origin-Embedder-Policy (COEP)",
    desc: "Requires CORS/CORP for all cross-origin resources (not graded)",
    graded: false,
  },
  {
    key: "cross-origin-resource-policy",
    name: "Cross-Origin-Resource-Policy (CORP)",
    desc: "Controls which origins can embed this resource (not graded)",
    graded: false,
  },
  {
    key: "x-xss-protection",
    name: "X-XSS-Protection",
    desc: "Legacy XSS filter (mostly superseded by CSP; not graded)",
    graded: false,
  },
];

const SIX_MONTHS_SECONDS = 15_552_000;

const REFERRER_TOKENS = new Set([
  "no-referrer",
  "no-referrer-when-downgrade",
  "origin",
  "origin-when-cross-origin",
  "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url",
]);

function parseCspDirectives(csp: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    // Per CSP Level 3, duplicate directives are ignored after the first occurrence.
    if (!directives.has(name)) {
      directives.set(name, tokens.slice(1).map((tok) => tok.toLowerCase()));
    }
  }
  return directives;
}

function hasCspFrameAncestors(csp: string | null): boolean {
  if (!csp) return false;
  const tokens = parseCspDirectives(csp).get("frame-ancestors");
  return !!tokens && tokens.length > 0 && !tokens.includes("*");
}

function gradeHsts(value: string | null): { status: HeaderStatus; reasonKey?: string; reasonArg?: string } {
  if (!value) return { status: "fail" };
  let maxAge: number | null = null;
  for (const part of value.split(";")) {
    const match = /^max-age\s*=\s*"?(\d+)"?$/i.exec(part.trim());
    if (match) {
      maxAge = Number(match[1]);
      break;
    }
  }
  if (maxAge === null || maxAge === 0) {
    return { status: "warn", reasonKey: "headers.weak.hstsZero" };
  }
  if (maxAge < SIX_MONTHS_SECONDS) {
    return { status: "warn", reasonKey: "headers.weak.hstsShort", reasonArg: String(maxAge) };
  }
  return { status: "pass" };
}

function gradeCsp(value: string | null): { status: HeaderStatus; reasonKey?: string } {
  if (!value) return { status: "fail" };
  const directives = parseCspDirectives(value);
  const tokens = directives.get("script-src") ?? directives.get("default-src");
  if (!tokens) return { status: "pass" };

  if (tokens.includes("'unsafe-eval'")) {
    return { status: "warn", reasonKey: "headers.weak.cspUnsafeEval" };
  }
  if (tokens.includes("'unsafe-inline'")) {
    const neutralized = tokens.some(
      (tok) =>
        tok === "'strict-dynamic'" ||
        tok.startsWith("'nonce-") ||
        tok.startsWith("'sha256-") ||
        tok.startsWith("'sha384-") ||
        tok.startsWith("'sha512-")
    );
    if (!neutralized) {
      return { status: "warn", reasonKey: "headers.weak.cspUnsafeInline" };
    }
  }
  if (tokens.includes("*")) {
    return { status: "warn", reasonKey: "headers.weak.cspWildcard" };
  }
  return { status: "pass" };
}

function gradeXcto(value: string | null): { status: HeaderStatus; reasonKey?: string } {
  if (!value) return { status: "fail" };
  return value.toLowerCase() === "nosniff"
    ? { status: "pass" }
    : { status: "warn", reasonKey: "headers.weak.xctoInvalid" };
}

function gradeXfo(value: string | null, csp: string | null): { status: HeaderStatus; reasonKey?: string } {
  const upper = value ? value.toUpperCase() : "";
  if (upper === "DENY" || upper === "SAMEORIGIN") {
    return { status: "pass" };
  }
  if (hasCspFrameAncestors(csp)) {
    return { status: "pass", reasonKey: "headers.note.cspFrameAncestors" };
  }
  if (value !== null) {
    return { status: "warn", reasonKey: "headers.weak.xfoInvalid" };
  }
  return { status: "fail" };
}

function gradeReferrer(value: string | null): { status: HeaderStatus; reasonKey?: string } {
  if (!value) return { status: "fail" };
  const recognized = value
    .split(",")
    .map((tok) => tok.trim().toLowerCase())
    .filter((tok) => REFERRER_TOKENS.has(tok));
  if (recognized.length === 0) {
    return { status: "warn", reasonKey: "headers.weak.referrerInvalid" };
  }
  if (recognized[recognized.length - 1] === "unsafe-url") {
    return { status: "warn", reasonKey: "headers.weak.referrerUnsafe" };
  }
  return { status: "pass" };
}

function gradeCoop(value: string | null): { status: HeaderStatus; reasonKey?: string } {
  if (!value) return { status: "fail" };
  const directive = value.split(";")[0].trim().toLowerCase();
  return directive === "same-origin" || directive === "same-origin-allow-popups"
    ? { status: "pass" }
    : { status: "warn", reasonKey: "headers.weak.coopWeak" };
}

function gradeOne(spec: HeaderSpec, value: string | null, csp: string | null): HeaderCheckResult {
  const base = {
    name: spec.name,
    key: spec.key,
    desc: spec.desc,
    value,
    present: value !== null,
    graded: spec.graded,
  };

  if (!spec.graded) {
    const reasonKey = spec.key === "x-xss-protection" && value?.startsWith("1")
      ? "headers.note.xssLegacy"
      : undefined;
    return { ...base, status: "info", ...(reasonKey ? { reasonKey } : {}) };
  }

  let verdict: { status: HeaderStatus; reasonKey?: string; reasonArg?: string };
  switch (spec.key) {
    case "strict-transport-security":
      verdict = gradeHsts(value);
      break;
    case "content-security-policy":
      verdict = gradeCsp(value);
      break;
    case "x-content-type-options":
      verdict = gradeXcto(value);
      break;
    case "x-frame-options":
      verdict = gradeXfo(value, csp);
      break;
    case "referrer-policy":
      verdict = gradeReferrer(value);
      break;
    case "permissions-policy":
      verdict = value ? { status: "pass" } : { status: "fail" };
      break;
    case "cross-origin-opener-policy":
      verdict = gradeCoop(value);
      break;
    default:
      verdict = value ? { status: "pass" } : { status: "fail" };
  }
  return { ...base, ...verdict };
}

export function evaluateHeaders(rawHeaders: Record<string, string>): HeadersEvaluation {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    const trimmed = v?.trim() ?? "";
    if (trimmed) headers[k.toLowerCase()] = trimmed;
  }

  const csp = headers["content-security-policy"] ?? null;
  const checks = SECURITY_HEADERS.map((spec) => gradeOne(spec, headers[spec.key] ?? null, csp));
  const graded = checks.filter((c) => c.graded);
  const passed = graded.filter((c) => c.status === "pass").length;
  const weak = graded.filter((c) => c.status === "warn").length;
  const missing = graded.filter((c) => c.status === "fail").length;
  const present = passed + weak;
  const total = graded.length;
  const points = passed + weak * 0.5;

  const grade: HeadersEvaluation["grade"] =
    points >= 6 && passed >= 6 ? "A"
    : points >= 5 ? "B"
    : points >= 3.5 ? "C"
    : points >= 2 ? "D"
    : "F";

  return {
    grade,
    score: { present, passed, weak, missing, total },
    checks,
  };
}
