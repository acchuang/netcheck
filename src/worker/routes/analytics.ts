import type { Env } from '../types';
import { corsHeaders, getCf, hashIp } from '../shared';

export async function handleAnalytics(env: Env, request: Request): Promise<Response> {
  try {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const prevMinute = currentMinute - 1;
    const today = new Date(now).toISOString().slice(0, 10);

    const [currentData, prevData, todayData, totalData] = await Promise.all([
      env.ANALYTICS.get(`active:${currentMinute}`, 'json') as Promise<Record<
        string,
        number
      > | null>,
      env.ANALYTICS.get(`active:${prevMinute}`, 'json') as Promise<Record<string, number> | null>,
      env.ANALYTICS.get(`unique:${today}`, 'json') as Promise<Record<string, number> | null>,
      env.ANALYTICS.get('total:visitors', 'json') as Promise<Record<string, number> | null>,
    ]);

    const currentMap = currentData || {};
    const prevActive = prevData ? Object.keys(prevData).length : 0;

    const requesterFp = await hashIp(request.headers.get('cf-connecting-ip') || 'unknown');
    if (!(requesterFp in currentMap)) {
      currentMap[requesterFp] = now;
    }

    const activeNow = Object.keys(currentMap).length + prevActive;

    const todayMap = todayData || {};
    const uniqueToday = Object.keys(todayMap).length || 1;

    const totalMap = totalData || {};
    const totalUnique = Object.keys(totalMap).length || 1;

    return Response.json(
      {
        activeNow,
        uniqueToday,
        totalUnique,
      },
      { headers: { ...corsHeaders(request), 'Cache-Control': 'public, max-age=30' } },
    );
  } catch {
    return Response.json(
      { activeNow: 1, uniqueToday: 1, totalUnique: 1 },
      { headers: corsHeaders(request) },
    );
  }
}

export function handleIpCheck(request: Request): Response {
  const ip =
    request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const country = request.headers.get('cf-ipcountry') || 'unknown';
  const cf = getCf(request);

  return Response.json(
    {
      ip,
      country,
      colo: cf.colo || 'unknown',
      asn: cf.asn || null,
      asOrganization: cf.asOrganization || null,
      city: cf.city || null,
      region: cf.region || null,
      timezone: cf.timezone || null,
      httpProtocol: cf.httpProtocol || null,
      tlsVersion: cf.tlsVersion || null,
      tlsCipher: cf.tlsCipher || null,
      clientTcpRtt: cf.clientTcpRtt || null,
      latitude: cf.latitude || null,
      longitude: cf.longitude || null,
    },
    { headers: corsHeaders(request) },
  );
}