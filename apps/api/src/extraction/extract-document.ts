import { DOCUMENT_EXTRACTION_PROMPT } from './extraction-prompt';
import { parseExtractedDocument, type ExtractedDocument } from './extracted-document.schema';

export type ExtractDocumentInput = {
  apiKey: string;
  baseUrl: string;
  model: string;
  image: Buffer;
  mimeType?: string;
  fetchImpl?: typeof fetch;
};

export type ExtractDocumentResult =
  | { ok: true; data: ExtractedDocument }
  | { ok: false; error: string };

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

export async function extractDocumentFromImage(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
  if (!input.apiKey.trim()) {
    return { ok: false, error: 'GLM/Z.AI API key is not configured' };
  }

  const mimeType = input.mimeType?.startsWith('image/') ? input.mimeType : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${input.image.toString('base64')}`;
  const endpoint = `${input.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const fetchImpl = input.fetchImpl ?? fetch;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DOCUMENT_EXTRACTION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: 'Extract this document page into the JSON schema.' },
          ],
        },
      ],
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: { message?: { content?: unknown } }[];
  };

  if (!response.ok) {
    return { ok: false, error: payload.error?.message ?? `Vision API returned ${response.status}` };
  }

  const text = messageText(payload.choices?.[0]?.message?.content);
  if (!text) {
    return { ok: false, error: 'Vision API returned an empty response' };
  }

  return parseExtractedDocument(text);
}
