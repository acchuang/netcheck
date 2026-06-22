import { aiState } from './state/ai-state';
import { collectTestResults } from './ai-collector';
import { buildShortPrompt } from './ai-prompt';

const MODEL_NAME = 'onnx-community/TinyLlama-1.1B-Chat-v1.0';

export async function analyzeWithLocal(): Promise<string> {
  aiState.modelDownloadProgress.set(0);
  aiState.loading.set(true);

  try {
    const { pipeline } = await import('@huggingface/transformers');

    const generator = await pipeline('text-generation', MODEL_NAME, {
      progress_callback: (info: unknown) => {
        const progress = (info as { progress?: number }).progress;
        if (typeof progress === 'number') {
          aiState.modelDownloadProgress.set(Math.round(progress));
        }
      },
    });

    aiState.modelReady.set(true);
    aiState.modelDownloadProgress.set(100);

    const payload = collectTestResults();
    const prompt = buildShortPrompt(payload);

    const result = await generator(prompt, {
      max_new_tokens: 512,
      temperature: 0.7,
      do_sample: true,
    });

    const generated = Array.isArray(result)
      ? result[0]
      : (result as { generated_text: string }).generated_text;
    const text = typeof generated === 'string' ? generated : generated.generated_text;
    return text.replace(prompt, '').trim();
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Local AI analysis failed', { cause: e });
  } finally {
    aiState.loading.set(false);
    aiState.modelDownloadProgress.set(0);
  }
}
