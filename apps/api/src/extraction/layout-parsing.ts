/**
 * Z.AI GLM-OCR layout parsing client.
 * POST /paas/v4/layout_parsing — returns Markdown + layout boxes (not ERP JSON).
 * @see https://docs.z.ai/api-reference/tools/layout-parsing
 */

const REQUEST_TIMEOUT_MS = 180_000;
export const LAYOUT_OCR_MODEL = 'glm-ocr';

export type LayoutDetail = {
  index: number;
  label: 'image' | 'text' | 'formula' | 'table' | string;
  bbox_2d?: number[];
  content?: string;
  height?: number;
  width?: number;
};

export type LayoutParsingResult = {
  id: string;
  created: number;
  model: string;
  md_results?: string;
  layout_details?: LayoutDetail[][];
  layout_visualization?: string[];
  data_info?: { num_pages: number; pages?: { width: number; height: number }[] };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  request_id?: string;
};

export type LayoutParsingInput = {
  apiKey: string;
  /** Base like https://api.z.ai/api/paas/v4 */
  baseUrl: string;
  /** Image/PDF bytes, or a public https URL string. */
  file: Buffer | string;
  mimeType?: string;
  returnCropImages?: boolean;
  needLayoutVisualization?: boolean;
  startPageId?: number;
  endPageId?: number;
  fetchImpl?: typeof fetch;
};

export type LayoutParsingOutcome =
  | { ok: true; data: LayoutParsingResult; layoutMs: number }
  | { ok: false; error: string };

function filePayload(file: Buffer | string, mimeType?: string): string {
  if (typeof file === 'string') return file;
  const mime = mimeType?.startsWith('image/') || mimeType === 'application/pdf' ? mimeType : 'image/jpeg';
  return `data:${mime};base64,${file.toString('base64')}`;
}

function errorMessage(payload: { error?: { message?: string; code?: string | number }; code?: string | number; msg?: string; message?: string }, status: number) {
  const message = payload.error?.message ?? payload.msg ?? payload.message ?? `Layout parsing returned ${status}`;
  const code = payload.error?.code ?? payload.code;
  return code == null ? message : `${code}: ${message}`;
}

export async function parseLayout(input: LayoutParsingInput): Promise<LayoutParsingOutcome> {
  if (!input.apiKey.trim()) {
    return { ok: false, error: 'GLM/Z.AI API key is not configured' };
  }

  const endpoint = `${input.baseUrl.replace(/\/$/, '')}/layout_parsing`;
  const fetchImpl = input.fetchImpl ?? fetch;
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
        model: LAYOUT_OCR_MODEL,
        file: filePayload(input.file, input.mimeType),
        ...(input.returnCropImages != null ? { return_crop_images: input.returnCropImages } : {}),
        ...(input.needLayoutVisualization != null ? { need_layout_visualization: input.needLayoutVisualization } : {}),
        ...(input.startPageId != null ? { start_page_id: input.startPageId } : {}),
        ...(input.endPageId != null ? { end_page_id: input.endPageId } : {}),
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch failed';
    return { ok: false, error: message || 'fetch failed' };
  }

  const payload = (await response.json().catch(() => ({}))) as LayoutParsingResult & {
    error?: { message?: string; code?: string | number };
    code?: string | number;
    msg?: string;
    message?: string;
  };

  if (!response.ok) {
    return { ok: false, error: errorMessage(payload, response.status) };
  }

  if (!payload.md_results && !payload.layout_details?.length) {
    return { ok: false, error: 'Layout parsing returned empty content' };
  }

  return { ok: true, data: payload, layoutMs: Date.now() - startedAt };
}
