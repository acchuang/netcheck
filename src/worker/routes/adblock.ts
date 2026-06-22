import type { Env } from '../types';
import { corsHeaders, checkRateLimit, median, percentile } from '../shared';

export async function handleAdBlockStats(env: Env, request: Request): Promise<Response> {
  try {
    const dayKey = `adblock:${new Date().toISOString().slice(0, 10)}`;
    const data = (await env.ANALYTICS.get(dayKey, 'json')) as {
      total: number;
      scores: number[];
    } | null;
    if (!data || !data.scores.length) {
      return Response.json(
        { total: 0, median: 0, p75: 0, p90: 0 },
        { headers: corsHeaders(request) },
      );
    }
    const sorted = [...data.scores].sort((a, b) => a - b);
    const med = median(sorted);
    const p75 = percentile(sorted, 0.75);
    const p90 = percentile(sorted, 0.9);
    return Response.json(
      { total: data.total, median: Math.round(med), p75: Math.round(p75), p90: Math.round(p90) },
      {
        headers: { ...corsHeaders(request), 'Cache-Control': 'public, max-age=300' },
      },
    );
  } catch {
    return Response.json(
      { total: 0, median: 0, p75: 0, p90: 0 },
      { headers: corsHeaders(request) },
    );
  }
}

export async function handleAdBlockSubmit(env: Env, request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  try {
    const body = (await request.json()) as { score: number };
    if (typeof body.score !== 'number' || body.score < 0 || body.score > 100) {
      return Response.json(
        { error: 'Invalid score' },
        { status: 400, headers: corsHeaders(request) },
      );
    }
    const dayKey = `adblock:${new Date().toISOString().slice(0, 10)}`;
    const data = (await env.ANALYTICS.get(dayKey, 'json')) as {
      total: number;
      scores: number[];
    } | null;
    const current = data || { total: 0, scores: [] };
    current.total += 1;
    current.scores.push(body.score);
    // Cap at 5000 scores to keep size manageable
    if (current.scores.length > 5000) current.scores.shift();
    await env.ANALYTICS.put(dayKey, JSON.stringify(current), { expirationTtl: 86400 * 2 });
    return Response.json({ ok: true }, { headers: corsHeaders(request) });
  } catch {
    return Response.json({ ok: false }, { status: 500, headers: corsHeaders(request) });
  }
}