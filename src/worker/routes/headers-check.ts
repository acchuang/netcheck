import { corsHeaders, checkRateLimit, isPrivateHostname } from '../shared';

const SECURITY_HEADERS = [
  { key: 'strict-transport-security', name: 'headers.hsts', desc: 'headers.hsts.desc' },
  { key: 'content-security-policy', name: 'headers.csp', desc: 'headers.csp.desc' },
  { key: 'x-content-type-options', name: 'headers.xcto', desc: 'headers.xcto.desc' },
  { key: 'x-frame-options', name: 'headers.xfo', desc: 'headers.xfo.desc' },
  { key: 'referrer-policy', name: 'headers.rp', desc: 'headers.rp.desc' },
  { key: 'permissions-policy', name: 'headers.pp', desc: 'headers.pp.desc' },
  { key: 'x-xss-protection', name: 'headers.xxss', desc: 'headers.xxss.desc' },
  { key: 'cross-origin-opener-policy', name: 'headers.coop', desc: 'headers.coop.desc' },
  { key: 'cross-origin-embedder-policy', name: 'headers.coep', desc: 'headers.coep.desc' },
  { key: 'cross-origin-resource-policy', name: 'headers.corp', desc: 'headers.corp.desc' },
];

export function validateTargetUrl(
  raw: string | null,
): { ok: true; url: string } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: 'Missing ?url= parameter' };

  const schemeMatch = raw.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch && !['http', 'https'].includes(schemeMatch[1].toLowerCase())) {
    return { ok: false, error: 'Only HTTP/HTTPS URLs are allowed' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Only HTTP/HTTPS URLs are allowed' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URLs with credentials are not allowed' };
  }
  if (isPrivateHostname(parsed.hostname)) {
    return { ok: false, error: 'Private/internal hostnames are not allowed' };
  }

  return { ok: true, url: parsed.href };
}

const MAX_REDIRECT_HOPS = 5;

export async function handleHeadersCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const url = new URL(request.url);
  const validation = validateTargetUrl(url.searchParams.get('url'));
  if (!validation.ok) {
    return Response.json(
      { error: validation.error },
      { status: 400, headers: corsHeaders(request) },
    );
  }
  let targetUrl = validation.url;

  try {
    let res: Response;
    let hops = 0;
    const redirectChain: string[] = [];
    while (true) {
      if (hops >= MAX_REDIRECT_HOPS) {
        return Response.json(
          { error: 'Too many redirects' },
          { status: 400, headers: corsHeaders(request) },
        );
      }
      res = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'NetCheck Security Scanner/1.0' },
      });

      if (res.status < 300 || res.status >= 400) {
        break;
      }

      const location = res.headers.get('location');
      if (!location) {
        break;
      }

      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, targetUrl);
      } catch {
        return Response.json(
          { error: 'Invalid redirect URL' },
          { status: 400, headers: corsHeaders(request) },
        );
      }

      if (isPrivateHostname(redirectUrl.hostname)) {
        return Response.json(
          { error: 'Redirect to private/internal hostname is not allowed' },
          { status: 400, headers: corsHeaders(request) },
        );
      }

      redirectChain.push(`${targetUrl} → ${redirectUrl.href}`);
      targetUrl = redirectUrl.href;
      hops++;
    }

    let securityTxt: {
      present: boolean;
      url: string | null;
      content: string | null;
      error: string | null;
    } = { present: false, url: null, content: null, error: null };
    try {
      const secTxtUrl = new URL('/.well-known/security.txt', new URL(targetUrl).origin);
      const secTxtRes = await fetch(secTxtUrl.toString(), { signal: AbortSignal.timeout(5000) });
      if (secTxtRes.ok) {
        const content = await secTxtRes.text();
        securityTxt = {
          present: true,
          url: secTxtUrl.toString(),
          content: content.substring(0, 2000),
          error: null,
        };
      } else {
        securityTxt = {
          present: false,
          url: null,
          content: null,
          error: `HTTP ${secTxtRes.status}`,
        };
      }
    } catch {
      securityTxt = { present: false, url: null, content: null, error: 'Not found' };
    }

    return buildHeadersResponse(res, targetUrl, request, securityTxt, redirectChain);
  } catch {
    return Response.json(
      { error: 'Failed to fetch URL' },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}

interface CspDirective {
  name: string;
  values: string[];
}

interface CspIssue {
  severity: 'high' | 'medium' | 'low' | 'info';
  directive: string;
  value: string;
  message: string;
}

interface CspAnalysis {
  present: boolean;
  raw: string | null;
  directives: CspDirective[];
  issues: CspIssue[];
  score: number;
  grade: string;
}

function parseCsp(cspHeader: string | null): CspAnalysis {
  if (!cspHeader) {
    return { present: false, raw: null, directives: [], issues: [], score: 0, grade: 'F' };
  }

  const directives: CspDirective[] = cspHeader.split(';').map((part) => {
    const trimmed = part.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
      return { name: trimmed.toLowerCase(), values: [] };
    }
    return {
      name: trimmed.substring(0, spaceIdx).toLowerCase(),
      values: trimmed
        .substring(spaceIdx + 1)
        .split(/\s+/)
        .filter(Boolean),
    };
  });

  const issues: CspIssue[] = [];
  const findDirective = (name: string) => directives.find((d) => d.name === name);
  const getValues = (name: string) => findDirective(name)?.values ?? [];

  const scriptSrc = getValues('script-src');
  const styleSrc = getValues('style-src');
  const defaultSrc = getValues('default-src');
  const objectSrc = getValues('object-src');
  const frameSrc = getValues('frame-src');
  const formAction = getValues('form-action');

  if (scriptSrc.includes("'unsafe-inline'")) {
    issues.push({
      severity: 'high',
      directive: 'script-src',
      value: "'unsafe-inline'",
      message: 'Allows inline scripts — vulnerable to XSS attacks',
    });
  }
  if (scriptSrc.includes("'unsafe-eval'")) {
    issues.push({
      severity: 'high',
      directive: 'script-src',
      value: "'unsafe-eval'",
      message: 'Allows eval() — vulnerable to code injection',
    });
  }
  if (scriptSrc.includes('*')) {
    issues.push({
      severity: 'high',
      directive: 'script-src',
      value: '*',
      message: 'Wildcard source — scripts can load from any origin',
    });
  }
  if (scriptSrc.some((v) => v === 'data:' || v === 'blob:')) {
    issues.push({
      severity: 'high',
      directive: 'script-src',
      value: 'data:/blob:',
      message: 'Allows data: or blob: URIs in scripts — XSS vector',
    });
  }
  if (styleSrc.includes("'unsafe-inline'")) {
    issues.push({
      severity: 'medium',
      directive: 'style-src',
      value: "'unsafe-inline'",
      message: 'Allows inline styles — potential CSS-based attacks',
    });
  }
  if (!findDirective('default-src')) {
    issues.push({
      severity: 'medium',
      directive: 'default-src',
      value: '',
      message: 'Missing default-src — fallback behavior is browser-dependent',
    });
  }
  if (!findDirective('frame-ancestors')) {
    issues.push({
      severity: 'low',
      directive: 'frame-ancestors',
      value: '',
      message: 'Missing frame-ancestors — relies on X-Frame-Options instead',
    });
  }
  if (frameSrc.includes('*') || defaultSrc.includes('*')) {
    issues.push({
      severity: 'medium',
      directive: 'frame-src',
      value: '*',
      message: 'Wildcard frame source — can embed any external content',
    });
  }
  if (formAction.includes('*') || (formAction.length === 0 && defaultSrc.includes('*'))) {
    issues.push({
      severity: 'medium',
      directive: 'form-action',
      value: '*',
      message: 'Wildcard form action — forms can submit to any URL',
    });
  }
  if (objectSrc.length > 0 && (objectSrc.includes('*') || objectSrc.includes('data:'))) {
    issues.push({
      severity: 'high',
      directive: 'object-src',
      value: objectSrc.join(' '),
      message: 'Permissive object-src — allows plugin content',
    });
  }
  if (findDirective('report-uri') || findDirective('report-to')) {
    issues.push({
      severity: 'info',
      directive: 'reporting',
      value: '',
      message: 'CSP violation reporting is configured (positive)',
    });
  }

  let score = 100;
  for (const issue of issues) {
    switch (issue.severity) {
      case 'high':
        score -= 25;
        break;
      case 'medium':
        score -= 15;
        break;
      case 'low':
        score -= 5;
        break;
      case 'info':
        score += 0;
        break;
    }
  }
  score = Math.max(0, Math.min(100, score));

  const grade =
    score >= 93
      ? 'A+'
      : score >= 85
        ? 'A'
        : score >= 70
          ? 'B'
          : score >= 55
            ? 'C'
            : score >= 40
              ? 'D'
              : 'F';

  return { present: true, raw: cspHeader, directives, issues, score, grade };
}

interface PermissionsPolicyIssue {
  severity: 'high' | 'medium' | 'low';
  directive: string;
  value: string;
  message: string;
}

interface PermissionsPolicyAnalysis {
  present: boolean;
  raw: string | null;
  directives: { name: string; values: string[] }[];
  issues: PermissionsPolicyIssue[];
  score: number;
  grade: string;
}

function parsePermissionsPolicy(raw: string | null): PermissionsPolicyAnalysis {
  if (!raw) return { present: false, raw: null, directives: [], issues: [], score: 0, grade: 'F' };

  const directives: { name: string; values: string[] }[] = [];
  const issues: PermissionsPolicyIssue[] = [];
  const parts = raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  let score = 100;

  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      const name = part.trim();
      directives.push({ name, values: ['*'] });
      if (name === '*') {
        issues.push({
          severity: 'high',
          directive: name,
          value: '*',
          message: 'Wildcard allows all origins for this feature',
        });
        score -= 15;
      }
      continue;
    }
    const name = part.slice(0, eq).trim();
    const valueStr = part.slice(eq + 1).trim();
    const values =
      valueStr === '()'
        ? []
        : valueStr
            .slice(1, -1)
            .split(' ')
            .map((v) => v.trim())
            .filter(Boolean);
    directives.push({ name, values });

    if (values.includes('*') || values.includes('self')) {
      if (
        ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'hid', 'serial'].includes(name)
      ) {
        issues.push({
          severity: 'high',
          directive: name,
          value: values.join(' '),
          message: `Sensitive feature ${name} should be restricted to specific origins`,
        });
        score -= 10;
      } else {
        issues.push({
          severity: 'medium',
          directive: name,
          value: values.join(' '),
          message: `Feature ${name} allows broadly — consider restricting to specific origins`,
        });
        score -= 5;
      }
    }
  }

  const foundDirectives = new Set(directives.map((d) => d.name));
  const missingCritical = ['camera', 'microphone', 'geolocation'].filter(
    (d) => !foundDirectives.has(d),
  );
  if (missingCritical.length > 0 && directives.length > 0) {
    for (const d of missingCritical) {
      issues.push({
        severity: 'low',
        directive: d,
        value: '',
        message: `Missing directive: ${d}. Consider explicitly restricting it with ()`,
      });
      score -= 2;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const grade =
    score >= 93
      ? 'A+'
      : score >= 85
        ? 'A'
        : score >= 70
          ? 'B'
          : score >= 55
            ? 'C'
            : score >= 40
              ? 'D'
              : 'F';

  return { present: true, raw, directives, issues, score, grade };
}

function buildHeadersResponse(
  res: Response,
  targetUrl: string,
  request: Request,
  securityTxt?: {
    present: boolean;
    url: string | null;
    content: string | null;
    error: string | null;
  },
  redirectChain: string[] = [],
): Response {
  const headers: Record<string, string> = {};
  for (const [key, value] of res.headers) {
    headers[key.toLowerCase()] = value;
  }

  const cspAnalysis = parseCsp(headers['content-security-policy'] || null);
  const permissionsPolicyAnalysis = parsePermissionsPolicy(headers['permissions-policy'] || null);

  const checks = SECURITY_HEADERS.map((h) => {
    const value = headers[h.key] || null;
    const present = !!value;
    let quality: 'good' | 'warn' | 'poor' | undefined;
    let qualityNote: string | undefined;

    if (present && value !== null) {
      switch (h.key) {
        case 'strict-transport-security': {
          const maxAgeMatch = value.match(/max-age=(\d+)/i);
          const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
          if (maxAge >= 31536000) {
            quality = 'good';
          } else if (maxAge >= 15552000) {
            quality = 'warn';
            qualityNote = `max-age is ${Math.round(maxAge / 86400)} days (recommended: ≥365 days)`;
          } else {
            quality = 'poor';
            qualityNote = `max-age is only ${maxAge} seconds (${Math.round(maxAge / 86400)} days)`;
          }
          break;
        }
        case 'x-frame-options': {
          const v = value.trim().toUpperCase();
          if (v === 'DENY' || v === 'SAMEORIGIN') quality = 'good';
          else if (v === 'ALLOWALL') {
            quality = 'poor';
            qualityNote = 'ALLOWALL is equivalent to not setting this header';
          } else {
            quality = 'poor';
            qualityNote = `Unrecognized value: ${value}`;
          }
          break;
        }
        case 'referrer-policy': {
          const v = value.trim().toLowerCase();
          if (
            v === 'no-referrer' ||
            v === 'strict-origin-when-cross-origin' ||
            v === 'no-referrer-when-downgrade'
          )
            quality = 'good';
          else if (v === 'origin' || v === 'unsafe-url') {
            quality = 'poor';
            qualityNote = `${value} leaks referrer data`;
          } else {
            quality = 'warn';
            qualityNote = `Unrecognized policy: ${value}`;
          }
          break;
        }
        case 'x-content-type-options': {
          quality = value.trim().toLowerCase() === 'nosniff' ? 'good' : 'poor';
          if (quality === 'poor') qualityNote = `Expected "nosniff", got "${value}"`;
          break;
        }
        case 'permissions-policy': {
          quality =
            permissionsPolicyAnalysis.score >= 70
              ? 'good'
              : permissionsPolicyAnalysis.score >= 40
                ? 'warn'
                : 'poor';
          if (quality === 'warn')
            qualityNote = `Permissions-Policy score: ${permissionsPolicyAnalysis.score}/100`;
          if (quality === 'poor')
            qualityNote = `Permissions-Policy score: ${permissionsPolicyAnalysis.score}/100 — many features unrestricted`;
          break;
        }
        case 'x-xss-protection': {
          if (value.trim() === '1; mode=block') {
            quality = 'warn';
            qualityNote = 'X-XSS-Protection is deprecated; use Content-Security-Policy instead';
          } else {
            quality = 'poor';
            qualityNote = `Value "${value}" provides no protection or may be harmful`;
          }
          break;
        }
        case 'cross-origin-opener-policy':
        case 'cross-origin-embedder-policy':
        case 'cross-origin-resource-policy': {
          quality = 'good';
          break;
        }
        case 'content-security-policy': {
          quality =
            cspAnalysis.present && cspAnalysis.score >= 70
              ? 'good'
              : cspAnalysis.present
                ? 'warn'
                : undefined;
          break;
        }
      }
    }

    return { name: h.name, key: h.key, desc: h.desc, value, present, quality, qualityNote };
  });

  const present = checks.filter((c) => c.present).length;
  const total = checks.length;

  const qualityPenalty = checks.reduce((sum, c) => {
    if (!c.present) return sum;
    if (c.quality === 'poor') return sum + 1;
    return sum;
  }, 0);
  const adjustedPresent = Math.max(0, present - qualityPenalty);
  const otherHeadersScore =
    total > 1 ? ((adjustedPresent - (cspAnalysis.present ? 1 : 0)) / (total - 1)) * 100 : 0;
  const cspWeight = 0.3;
  const otherWeight = 0.7;
  const weightedScore = cspAnalysis.present
    ? cspWeight * cspAnalysis.score + otherWeight * otherHeadersScore
    : otherHeadersScore;
  const grade =
    weightedScore >= 93
      ? 'A+'
      : weightedScore >= 85
        ? 'A'
        : weightedScore >= 70
          ? 'B'
          : weightedScore >= 55
            ? 'C'
            : weightedScore >= 40
              ? 'D'
              : 'F';

  const suggestions: Array<{
    header: string;
    severity: 'critical' | 'important' | 'info';
    message: string;
    fix: string;
    url: string;
  }> = [];

  const headerDocs: Record<string, string> = {
    'strict-transport-security':
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security',
    'content-security-policy': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP',
    'x-content-type-options':
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options',
    'x-frame-options': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options',
    'referrer-policy': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy',
    'permissions-policy':
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy',
    'x-xss-protection':
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection',
    'cross-origin-opener-policy':
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy',
    'cross-origin-embedder-policy':
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy',
    'cross-origin-resource-policy':
      'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Resource-Policy',
  };

  const headerFixes: Record<string, string> = {
    'strict-transport-security':
      'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
    'content-security-policy': "Content-Security-Policy: default-src 'self'",
    'x-content-type-options': 'X-Content-Type-Options: nosniff',
    'x-frame-options': 'X-Frame-Options: DENY',
    'referrer-policy': 'Referrer-Policy: strict-origin-when-cross-origin',
    'permissions-policy': 'Permissions-Policy: camera=(), microphone=(), geolocation=()',
    'x-xss-protection': 'Remove X-XSS-Protection (deprecated; use CSP instead)',
    'cross-origin-opener-policy': 'Cross-Origin-Opener-Policy: same-origin',
    'cross-origin-embedder-policy': 'Cross-Origin-Embedder-Policy: require-corp',
    'cross-origin-resource-policy': 'Cross-Origin-Resource-Policy: same-origin',
  };

  const headerSeverity: Record<string, 'critical' | 'important' | 'info'> = {
    'strict-transport-security': 'critical',
    'content-security-policy': 'critical',
    'x-content-type-options': 'important',
    'x-frame-options': 'important',
    'referrer-policy': 'important',
    'permissions-policy': 'info',
    'x-xss-protection': 'info',
    'cross-origin-opener-policy': 'important',
    'cross-origin-embedder-policy': 'important',
    'cross-origin-resource-policy': 'important',
  };

  for (const check of checks) {
    if (!check.present) {
      suggestions.push({
        header: check.key,
        severity: headerSeverity[check.key] || 'info',
        message: `Missing ${check.key} header`,
        fix: headerFixes[check.key] || `Add ${check.key} header`,
        url: headerDocs[check.key] || '',
      });
    } else if (check.quality === 'poor' && check.qualityNote) {
      suggestions.push({
        header: check.key,
        severity: 'important',
        message: check.qualityNote,
        fix: headerFixes[check.key] || `Fix ${check.key} configuration`,
        url: headerDocs[check.key] || '',
      });
    }
  }

  const infoHeaders: Array<{ key: string; name: string }> = [
    { key: 'server', name: 'Server' },
    { key: 'x-powered-by', name: 'X-Powered-By' },
  ];
  for (const ih of infoHeaders) {
    const value = headers[ih.key];
    if (value) {
      suggestions.push({
        header: ih.key,
        severity: 'info',
        message: `${ih.name} header reveals server technology: "${value.substring(0, 50)}${value.length > 50 ? '…' : ''}"`,
        fix:
          ih.key === 'server'
            ? 'Remove or minimize the Server header via your web server configuration'
            : 'Remove the X-Powered-By header: app.disable("x-powered-by") (Express), or add corresponding middleware',
        url:
          ih.key === 'server'
            ? 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server'
            : 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Powered-By',
      });
    }
  }

  return Response.json(
    {
      url: targetUrl,
      statusCode: res.status,
      grade,
      score: { present, total },
      checks,
      cspAnalysis,
      permissionsPolicyAnalysis,
      suggestions,
      securityTxt: securityTxt || { present: false, url: null, content: null, error: null },
      server: headers['server'] || null,
      poweredBy: headers['x-powered-by'] || null,
      redirectChain,
    },
    { headers: corsHeaders(request) },
  );
}
