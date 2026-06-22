import { corsHeaders, checkRateLimit } from '../shared';

export function handleHeaders(request: Request): Response {
  const headers: Record<string, string> = {};
  for (const [key, value] of request.headers) {
    headers[key] = value;
  }
  return Response.json({ headers }, { headers: corsHeaders(request) });
}

let RANDOM_BLOCK: Uint8Array | null = null;

export function getRandomBlock(): Uint8Array {
  if (!RANDOM_BLOCK) {
    RANDOM_BLOCK = new Uint8Array(65536);
    crypto.getRandomValues(RANDOM_BLOCK);
  }
  return RANDOM_BLOCK;
}

export function handleSpeedDown(url: URL, request: Request): Response {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const rawBytesParam = url.searchParams.get('bytes');
  const rawBytes = rawBytesParam !== null ? Number(rawBytesParam) : NaN;
  const bytes = Number.isFinite(rawBytes) ? Math.min(Math.trunc(rawBytes), 100000000) : 0;
  if (bytes <= 0) {
    return new Response('', { headers: corsHeaders(request) });
  }
  const block = getRandomBlock();
  const data = new Uint8Array(bytes);
  for (let offset = 0; offset < bytes; offset += block.length) {
    const chunkSize = Math.min(block.length, bytes - offset);
    data.set(block.subarray(0, chunkSize), offset);
  }
  return new Response(data, {
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes),
      'Cache-Control': 'no-store',
    },
  });
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function handleSpeedUp(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: 'Request body too large' },
      { status: 413, headers: corsHeaders(request) },
    );
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: 'Request body too large' },
      { status: 413, headers: corsHeaders(request) },
    );
  }
  return Response.json({ bytes: body.byteLength }, { headers: corsHeaders(request) });
}