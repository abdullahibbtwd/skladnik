import { DOCUMENT_EXTRACTION_PROMPT } from './extraction-prompt';
import { parseExtractedDocument, type ExtractedDocument } from './extracted-document.schema';
import { isVisionQuotaError } from './ocr-errors';
import { prepareVisionImage } from './prepare-vision-image';

export const DEFAULT_VISION_MODEL = 'glm-5.3-flash';
const FALLBACK_VISION_MODELS = [DEFAULT_VISION_MODEL, 'glm-4.6v-flash'];
// A 20-line invoice takes glm-4.6v-flash 65–130 s (~80 tokens/s incl. reasoning).
const REQUEST_TIMEOUT_MS = 180_000;

export type ExtractDocumentInput = {
  apiKey: string;
  baseUrl: string;
  model: string;
  image: Buffer;
  mimeType?: string;
  fetchImpl?: typeof fetch;
};

export type ExtractDocumentResult =
  | { ok: true; data: ExtractedDocument; model: string }
  | { ok: false; error: string };

type VisionPayload = {
  error?: { message?: string; code?: string | number };
  code?: string | number;
  msg?: string;
  message?: string;
  choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[];
};

function partText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if ('text' in part && typeof part.text === 'string') return part.text;
          if ('thinking' in part && typeof part.thinking === 'string') return part.thinking;
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

function messageText(message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; thinking?: unknown }) {
  return [
    partText(message?.content),
    partText(message?.reasoning_content),
    partText(message?.reasoning),
    partText(message?.thinking),
  ]
    .filter(Boolean)
    .join('\n');
}

function visionErrorMessage(payload: VisionPayload, status: number) {
  const message = payload.error?.message ?? payload.msg ?? payload.message ?? `Vision API returned ${status}`;
  const code = payload.error?.code ?? payload.code;
  return code == null ? message : `${code}: ${message}`;
}

function modelsToTry(preferred: string) {
  return [preferred, ...FALLBACK_VISION_MODELS].filter((model, index, list) => model && list.indexOf(model) === index);
}

async function requestExtraction(
  input: ExtractDocumentInput,
  model: string,
): Promise<ExtractDocumentResult> {
  const mimeType = input.mimeType?.startsWith('image/') ? input.mimeType : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${input.image.toString('base64')}`;
  const endpoint = `${input.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const fetchImpl = input.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US,en',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        thinking: { type: 'enabled', clear_thinking: true },
        messages: [
          { role: 'system', content: DOCUMENT_EXTRACTION_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: 'Extract this document page into the JSON schema. Return JSON only.' },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch failed';
    return { ok: false, error: message || 'fetch failed' };
  }

  const payload = (await response.json().catch(() => ({}))) as VisionPayload;

  if (!response.ok) {
    return { ok: false, error: visionErrorMessage(payload, response.status) };
  }

  const text = messageText(payload.choices?.[0]?.message);
  if (!text) {
    return { ok: false, error: 'Vision API returned an empty response' };
  }

  const parsed = parseExtractedDocument(text);
  return parsed.ok ? { ...parsed, model } : parsed;
}

export async function extractDocumentFromImage(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
  if (!input.apiKey.trim()) {
    return { ok: false, error: 'GLM/Z.AI API key is not configured' };
  }

  const prepared = await prepareVisionImage(input.image, input.mimeType);
  const preparedInput = { ...input, image: prepared.buffer, mimeType: prepared.mimeType };

  let lastError = 'Vision API request failed';
  for (const model of modelsToTry(input.model)) {
    const result = await requestExtraction(preparedInput, model);
    if (result.ok) return result;
    lastError = result.error;
    if (!isVisionQuotaError(lastError)) {
      return { ok: false, error: lastError };
    }
  }

  return { ok: false, error: lastError };
}
