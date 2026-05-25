import type { TestResultsPayload } from './ai-collector';
import { buildPrompt } from './ai-prompt';

export async function analyzeWithCloud(payload: TestResultsPayload): Promise<string> {
  const prompt = buildPrompt(payload);

  const res = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI analysis failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { analysis: string };
  return data.analysis;
}
