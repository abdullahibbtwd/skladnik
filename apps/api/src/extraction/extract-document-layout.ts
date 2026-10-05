/**
 * Fast layout OCR path:
 * 1) GLM-OCR → Markdown (~10 s)
 * 2) Parse HTML line table locally (ms)
 * 3) Optional tiny flash LLM for header only — skipped when regex header is good enough
 *
 * Vision chat/completions path stays available via OCR_ENGINE=vision.
 */
import { COMPACT_OUTPUT_RULE, HEADER_EXTRACTION_PROMPT } from './extraction-prompt';
import { parseExtractedDocument } from './extracted-document.schema';
import {
  extractDocumentFromImage,
  type ExtractDocumentInput,
  type ExtractDocumentResult,
  type ExtractionTimings,
  type ReasoningEffort,
} from './extract-document';
import { LAYOUT_OCR_MODEL, parseLayout } from './layout-parsing';
import {
  headerFromLayoutMarkdown,
  headerMarkdown,
  linesFromLayoutMarkdown,
  mergeLayoutExtraction,
} from './parse-layout-markdown';

const REQUEST_TIMEOUT_MS = 60_000;
/** Free/fast text model for header-only structuring when regex is incomplete. */
export const DEFAULT_LAYOUT_STRUCT_MODEL = 'glm-4.5-flash';

const hasEffortLevels = (model: string) => /^glm-5\.[23]\b/i.test(model);

function reasoningFields(model: string, effort: ReasoningEffort | undefined) {
  if (hasEffortLevels(model)) return { thinking: { type: 'enabled' }, ...(effort ? { reasoning_effort: effort } : {}) };
  // Flash / older models: keep thinking off for speed.
  return { thinking: { type: 'disabled' } };
}

function headerLooksComplete(header: ReturnType<typeof headerFromLayoutMarkdown>) {
  return Boolean(header.documentNumber && header.issuedOn && header.supplier?.name && header.supplier?.taxId);
}

/** Flash models sometimes return `"supplier": null` — coerce to {} before Zod. */
function normalizeHeaderPayload(text: string): string {
  try {
    const raw = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim()) as Record<string, unknown>;
    const root = (raw.answer ?? raw.data ?? raw.result ?? raw) as Record<string, unknown>;
    if (root.supplier == null || typeof root.supplier !== 'object') root.supplier = {};
    if (root.client == null || typeof root.client !== 'object') root.client = {};
    return JSON.stringify(root);
  } catch {
    return text;
  }
}

async function structureHeader(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  markdown: string;
  effort?: ReasoningEffort;
  compact?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; text: string; model: string; outputTokens: number | null; structureMs: number } | { ok: false; error: string }> {
  const endpoint = `${input.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const fetchImpl = input.fetchImpl ?? fetch;
  const system =
    HEADER_EXTRACTION_PROMPT +
    '\n\nSOURCE: Markdown OCR of a document HEADER (line-item table omitted). Extract header JSON only.' +
    (input.compact ? COMPACT_OUTPUT_RULE : '');
  const startedAt = Date.now();

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
        model: input.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        ...reasoningFields(input.model, input.effort ?? 'low'),
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Extract header fields from this OCR Markdown. Return JSON only.\n\n---\n${input.markdown}\n---`,
          },
        ],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch failed';
    return { ok: false, error: message || 'fetch failed' };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string | number };
    code?: string | number;
    msg?: string;
    message?: string;
    choices?: { message?: { content?: unknown } }[];
    usage?: { completion_tokens?: number };
  };

  if (!response.ok) {
    const message = payload.error?.message ?? payload.msg ?? payload.message ?? `API returned ${response.status}`;
    const code = payload.error?.code ?? payload.code;
    return { ok: false, error: code == null ? message : `${code}: ${message}` };
  }

  const content = payload.choices?.[0]?.message?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => (typeof part === 'object' && part && 'text' in part ? String(part.text) : '')).join('\n')
        : '';
  if (!text) return { ok: false, error: 'Header structurer returned an empty response' };
  return {
    ok: true,
    text,
    model: input.model,
    outputTokens: payload.usage?.completion_tokens ?? null,
    structureMs: Date.now() - startedAt,
  };
}

export type LayoutExtractOptions = ExtractDocumentInput & {
  /** Override GLM_MODEL for the optional header call (default glm-4.5-flash). */
  structureModel?: string;
  /** Force the header LLM even when regex looks complete. */
  alwaysStructureHeader?: boolean;
  /** When layout Markdown has no table, fall back to vision chat/completions (default true). */
  visionFallback?: boolean;
};

export async function extractDocumentViaLayout(input: LayoutExtractOptions): Promise<ExtractDocumentResult> {
  const layout = await parseLayout({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    file: input.image,
    mimeType: input.mimeType,
    fetchImpl: input.fetchImpl,
  });
  if (!layout.ok) return layout;

  const markdown = layout.data.md_results?.trim();
  if (!markdown) {
    if (input.visionFallback === false) return { ok: false, error: 'Layout parsing returned no Markdown' };
    return extractDocumentFromImage(input);
  }

  const lines = linesFromLayoutMarkdown(markdown);
  if (!lines.length) {
    // Dot-matrix / dashed-line warehouse forms often come back as unusable Markdown.
    if (input.visionFallback === false) {
      return { ok: false, error: 'Layout Markdown had no parseable line-item table' };
    }
    const vision = await extractDocumentFromImage(input);
    if (vision.ok) {
      return {
        ...vision,
        model: `${LAYOUT_OCR_MODEL}→${vision.model}`,
        timings: {
          ...vision.timings,
          prepareMs: (vision.timings.prepareMs ?? 0) + layout.layoutMs,
        },
      };
    }
    return { ok: false, error: vision.error || 'Layout Markdown had no parseable line-item table' };
  }

  let header = headerFromLayoutMarkdown(markdown);
  let structureModelUsed: string | null = null;
  let structureMs = 0;
  let outputTokens: number | null = null;

  const needLlm = input.alwaysStructureHeader || !headerLooksComplete(header);
  let structureError: string | null = null;
  if (needLlm) {
    const structured = await structureHeader({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.structureModel?.trim() || DEFAULT_LAYOUT_STRUCT_MODEL,
      markdown: headerMarkdown(markdown),
      effort: 'low',
      compact: input.tuning?.compact ?? true,
      fetchImpl: input.fetchImpl,
    });
    if (structured.ok) {
      const normalized = normalizeHeaderPayload(structured.text);
      const unwrapped = parseExtractedDocument(normalized);
      if (unwrapped.ok) {
        const llm = unwrapped.data;
        header = {
          ...llm,
          documentNumber: llm.documentNumber ?? header.documentNumber,
          issuedOn: llm.issuedOn ?? header.issuedOn,
          supplier: {
            name: llm.supplier.name ?? header.supplier?.name ?? null,
            taxId: llm.supplier.taxId ?? header.supplier?.taxId ?? null,
            address: llm.supplier.address ?? header.supplier?.address ?? null,
            mol: llm.supplier.mol ?? header.supplier?.mol ?? null,
            phone: llm.supplier.phone ?? header.supplier?.phone ?? null,
          },
          client: {
            name: llm.client.name ?? header.client?.name ?? null,
            taxId: llm.client.taxId ?? header.client?.taxId ?? null,
            address: llm.client.address ?? header.client?.address ?? null,
          },
          taxableBase: llm.taxableBase ?? header.taxableBase,
          vatAmount: llm.vatAmount ?? header.vatAmount,
          grossTotal: llm.grossTotal ?? header.grossTotal,
          amountInWords: llm.amountInWords ?? header.amountInWords,
          paymentMethod: llm.paymentMethod ?? header.paymentMethod,
          confidence: llm.confidence,
          fieldConfidence: llm.fieldConfidence,
        };
        structureModelUsed = structured.model;
        structureMs = structured.structureMs;
        outputTokens = structured.outputTokens;
      } else {
        structureError = unwrapped.error;
      }
    } else {
      structureError = structured.error;
    }
  }

  const data = mergeLayoutExtraction(header, lines);
  const timings: ExtractionTimings = {
    prepareMs: structureMs,
    visionMs: layout.layoutMs,
    imageBytes: input.image.length,
    width: layout.data.data_info?.pages?.[0]?.width ?? null,
    height: layout.data.data_info?.pages?.[0]?.height ?? null,
    outputTokens,
    reasoningTokens: null,
  };

  const modelTag = structureModelUsed
    ? `${LAYOUT_OCR_MODEL}+table+${structureModelUsed}`
    : structureError
      ? `${LAYOUT_OCR_MODEL}+table(header-llm:${structureError.slice(0, 80)})`
      : `${LAYOUT_OCR_MODEL}+table`;
  return { ok: true, data, model: modelTag, timings };
}
