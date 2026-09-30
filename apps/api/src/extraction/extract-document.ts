import { COMPACT_OUTPUT_RULE, DOCUMENT_EXTRACTION_PROMPT, HEADER_EXTRACTION_PROMPT, LINES_EXTRACTION_PROMPT } from './extraction-prompt';
import { extractJsonValue, parseExtractedDocument, type ExtractedDocument } from './extracted-document.schema';
import { isVisionQuotaError } from './ocr-errors';
import { prepareVisionImage, type VisionImageOptions } from './prepare-vision-image';

export const DEFAULT_VISION_MODEL = 'glm-5.3-flash';
const FALLBACK_VISION_MODELS = [DEFAULT_VISION_MODEL, 'glm-4.6v-flash'];
// A 20-line invoice takes glm-4.6v-flash 65–130 s (~80 tokens/s incl. reasoning).
const REQUEST_TIMEOUT_MS = 180_000;

export type ReasoningEffort = 'low' | 'high' | 'max';

export type VisionTuning = VisionImageOptions & {
  /**
   * How long GLM-5.2/5.3 models reason before answering; they can't turn it off, and default to
   * max. Other models only know on/off: `low` switches their thinking off.
   */
  effort?: ReasoningEffort;
  /** When set, header, parties and totals are read by this model in parallel with the lines. */
  headerModel?: string | null;
  /** Ask for single-line JSON without null line fields (less to write, so faster). */
  compact?: boolean;
};

const hasEffortLevels = (model: string) => /^glm-5\.[23]\b/i.test(model);

function reasoningFields(model: string, effort: ReasoningEffort | undefined) {
  if (hasEffortLevels(model)) return { thinking: { type: 'enabled' }, ...(effort ? { reasoning_effort: effort } : {}) };
  return { thinking: effort === 'low' ? { type: 'disabled' } : { type: 'enabled', clear_thinking: true } };
}

export type ExtractDocumentInput = {
  apiKey: string;
  baseUrl: string;
  model: string;
  image: Buffer;
  mimeType?: string;
  fetchImpl?: typeof fetch;
  tuning?: VisionTuning;
};

export type ExtractionTimings = {
  prepareMs: number;
  visionMs: number;
  imageBytes: number;
  width: number | null;
  height: number | null;
  /** Tokens the model wrote (answer + reasoning): reading time is mostly this. */
  outputTokens: number | null;
  reasoningTokens: number | null;
};

export type ExtractDocumentResult =
  | { ok: true; data: ExtractedDocument; model: string; timings: ExtractionTimings }
  | { ok: false; error: string };

type RequestResult =
  | { ok: true; text: string; model: string; outputTokens: number | null; reasoningTokens: number | null }
  | { ok: false; error: string };

type VisionPayload = {
  error?: { message?: string; code?: string | number };
  code?: string | number;
  msg?: string;
  message?: string;
  choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[];
  usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
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
  systemPrompt: string,
): Promise<RequestResult> {
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
        ...reasoningFields(model, input.tuning?.effort),
        messages: [
          { role: 'system', content: systemPrompt },
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
  return {
    ok: true,
    text,
    model,
    outputTokens: payload.usage?.completion_tokens ?? null,
    reasoningTokens: payload.usage?.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

/** Tries the preferred model, then the fallbacks while the error is a quota/rate limit. */
async function requestWithFallback(input: ExtractDocumentInput, preferred: string, systemPrompt: string): Promise<RequestResult> {
  let lastError = 'Vision API request failed';
  for (const model of modelsToTry(preferred)) {
    const result = await requestExtraction(input, model, systemPrompt);
    if (result.ok) return result;
    lastError = result.error;
    if (!isVisionQuotaError(lastError)) break;
  }
  return { ok: false, error: lastError };
}

const CONFIDENCE_ORDER = ['low', 'medium', 'high'];

/** Header from one reply, lines from the other; the lower self-reported confidence wins. */
function mergeSplit(headerText: string, linesText: string): unknown {
  const header = extractJsonValue(headerText);
  const lines = extractJsonValue(linesText);
  if (!header || typeof header !== 'object' || !lines || typeof lines !== 'object') return null;
  const h = header as Record<string, unknown>;
  const l = lines as Record<string, unknown>;
  const confidence = [h.confidence, l.confidence]
    .filter((value): value is string => typeof value === 'string' && CONFIDENCE_ORDER.includes(value))
    .sort((a, b) => CONFIDENCE_ORDER.indexOf(a) - CONFIDENCE_ORDER.indexOf(b))[0];
  return { ...h, lines: l.lines ?? [], ...(confidence ? { confidence } : {}) };
}

export async function extractDocumentFromImage(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
  if (!input.apiKey.trim()) {
    return { ok: false, error: 'GLM/Z.AI API key is not configured' };
  }

  const startedAt = Date.now();
  const prepared = await prepareVisionImage(input.image, input.mimeType, input.tuning);
  const preparedInput = { ...input, image: prepared.buffer, mimeType: prepared.mimeType };
  const preparedAt = Date.now();
  const sum = (values: (number | null)[]) => (values.every((value) => value === null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0));
  const timings = (...replies: { outputTokens: number | null; reasoningTokens: number | null }[]): ExtractionTimings => ({
    prepareMs: preparedAt - startedAt,
    visionMs: Date.now() - preparedAt,
    imageBytes: prepared.buffer.length,
    width: prepared.width,
    height: prepared.height,
    outputTokens: sum(replies.map((reply) => reply.outputTokens)),
    reasoningTokens: sum(replies.map((reply) => reply.reasoningTokens)),
  });

  const system = (prompt: string) => (input.tuning?.compact ? prompt + COMPACT_OUTPUT_RULE : prompt);
  const headerModel = input.tuning?.headerModel;
  if (headerModel) {
    const [header, lines] = await Promise.all([
      requestWithFallback(preparedInput, headerModel, system(HEADER_EXTRACTION_PROMPT)),
      requestWithFallback(preparedInput, input.model, system(LINES_EXTRACTION_PROMPT)),
    ]);
    if (!header.ok) return header;
    if (!lines.ok) return lines;
    const merged = mergeSplit(header.text, lines.text);
    if (merged === null) return { ok: false, error: 'Model did not return valid JSON' };
    const parsed = parseExtractedDocument(merged);
    return parsed.ok ? { ...parsed, model: `${lines.model}+${header.model}`, timings: timings(header, lines) } : parsed;
  }

  const result = await requestWithFallback(preparedInput, input.model, system(DOCUMENT_EXTRACTION_PROMPT));
  if (!result.ok) return result;
  const parsed = parseExtractedDocument(result.text);
  return parsed.ok ? { ...parsed, model: result.model, timings: timings(result) } : parsed;
}
