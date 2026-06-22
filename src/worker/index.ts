import type { Env } from './types';
import {
  withSecurityHeaders,
  getCf,
  corsHeaders,
  checkRateLimit,
  isPrivateHostname,
  hashIp,
  trackVisitor,
  rateLimitMap,
  RATE_LIMIT_MAX,
  RATE_LIMIT_SPEED_BURST,
} from './shared';

import {
  handleDnsCheck,
  handleResolverCheck,
  handleSecurityCheck,
  handleHijackCheck,
  handleEcsCheck,
  handleDnsBenchmark,
} from './routes/dns';

import { handleHeaders, handleSpeedDown, handleSpeedUp } from './routes/speed';
import { handleIpCheck, handleAnalytics } from './routes/analytics';
import { handleMapProbes, handleRegionPing } from './routes/map';
import { handleHeadersCheck, validateTargetUrl } from './routes/headers-check';
import { handleAdBlockStats, handleAdBlockSubmit } from './routes/adblock';
import { handleAiAnalyze } from './routes/ai';
import { handleEmailSecurity } from './routes/email';
import { handleCertTransparency } from './routes/cert-transparency';
import { handleTlsTargetCheck } from './routes/tls';
import { handleDnssecValidation } from './routes/dnssec';

export {
  isPrivateHostname,
  hashIp,
  checkRateLimit,
  corsHeaders,
  rateLimitMap,
  RATE_LIMIT_MAX,
  RATE_LIMIT_SPEED_BURST,
  validateTargetUrl,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return withSecurityHeaders(
        new Response(null, { status: 204, headers: corsHeaders(request) }),
        request,
      );
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/ip') {
      trackVisitor(request, env).catch(() => {});
      return withSecurityHeaders(await handleIpCheck(request), request);
    }

    if (url.pathname === '/api/dns') {
      return withSecurityHeaders(await handleDnsCheck(request), request);
    }

    if (url.pathname === '/api/headers') {
      return withSecurityHeaders(await handleHeaders(request), request);
    }

    if (url.pathname === '/api/headers/check') {
      return withSecurityHeaders(await handleHeadersCheck(request), request);
    }

    if (url.pathname === '/api/dns/check-resolvers') {
      return withSecurityHeaders(await handleResolverCheck(request), request);
    }

    if (url.pathname === '/api/dns/check-security') {
      return withSecurityHeaders(await handleSecurityCheck(request), request);
    }

    if (url.pathname === '/api/analytics') {
      trackVisitor(request, env).catch(() => {});
      return withSecurityHeaders(await handleAnalytics(env, request), request);
    }

    if (url.pathname === '/api/map/probes') {
      trackVisitor(request, env).catch(() => {});
      return withSecurityHeaders(await handleMapProbes(request), request);
    }

    if (url.pathname === '/api/map/ping' && url.searchParams.has('region')) {
      return withSecurityHeaders(await handleRegionPing(url, env, request), request);
    }

    if (url.pathname === '/api/speedtest/ping') {
      const cf = getCf(request);
      const colo = cf.colo || 'unknown';
      return withSecurityHeaders(
        new Response('pong', {
          headers: {
            ...corsHeaders(request),
            'x-colo': colo,
            'x-lat': cf?.latitude || '',
            'x-lon': cf?.longitude || '',
            'Access-Control-Expose-Headers': 'x-colo, x-lat, x-lon',
          },
        }),
        request,
      );
    }

    if (url.pathname === '/api/speedtest/down') {
      return withSecurityHeaders(await handleSpeedDown(url, request), request);
    }

    if (url.pathname === '/api/speedtest/up' && request.method === 'POST') {
      return withSecurityHeaders(await handleSpeedUp(request), request);
    }

    if (url.pathname === '/api/dns/hijack-check') {
      return withSecurityHeaders(await handleHijackCheck(request), request);
    }

    if (url.pathname === '/api/dns/ecs-check') {
      return withSecurityHeaders(await handleEcsCheck(request), request);
    }

    if (url.pathname === '/api/dns/benchmark') {
      return withSecurityHeaders(await handleDnsBenchmark(request), request);
    }

    if (url.pathname === '/api/adblock/stats') {
      if (request.method === 'GET') {
        trackVisitor(request, env).catch(() => {});
        return withSecurityHeaders(await handleAdBlockStats(env, request), request);
      }
      if (request.method === 'POST') {
        trackVisitor(request, env).catch(() => {});
        return withSecurityHeaders(await handleAdBlockSubmit(env, request), request);
      }
    }

    if (url.pathname === '/api/ai/analyze' && request.method === 'POST') {
      trackVisitor(request, env).catch(() => {});
      return withSecurityHeaders(await handleAiAnalyze(request, env), request);
    }

    if (url.pathname === '/api/email-security') {
      return withSecurityHeaders(await handleEmailSecurity(request), request);
    }

    if (url.pathname === '/api/cert-transparency') {
      return withSecurityHeaders(await handleCertTransparency(request), request);
    }

    if (url.pathname === '/api/tls/check') {
      return withSecurityHeaders(await handleTlsTargetCheck(request), request);
    }

    if (url.pathname === '/api/dns/dnssec-validate') {
      return withSecurityHeaders(await handleDnssecValidation(request), request);
    }

    if (url.pathname === '/robots.txt') {
      const robots = ['User-agent: *', 'Allow: /', `Sitemap: ${url.origin}/sitemap.xml`].join('\n');
      return withSecurityHeaders(
        new Response(robots, {
          headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' },
        }),
        request,
      );
    }

    if (url.pathname === '/sitemap.xml') {
      const today = new Date().toISOString().slice(0, 10);
      const origin = url.origin;
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${origin}/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="zh-TW" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="es" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="ja" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="ko" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}/"/>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
      return withSecurityHeaders(
        new Response(sitemap, {
          headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=86400' },
        }),
        request,
      );
    }

    return withSecurityHeaders(
      Response.json({ error: 'Not Found' }, { status: 404, headers: corsHeaders(request) }),
      request,
    );
  },
};
