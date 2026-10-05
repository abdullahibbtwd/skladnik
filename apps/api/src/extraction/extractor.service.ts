import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractDocumentFromImage, type ExtractDocumentResult, type ReasoningEffort, type VisionTuning } from './extract-document';
import { DEFAULT_LAYOUT_STRUCT_MODEL, extractDocumentViaLayout } from './extract-document-layout';

const EFFORTS: ReasoningEffort[] = ['low', 'high', 'max'];
/** Chosen with scripts/bench-extraction.cjs (audit F-17); GLM's own default is max. */
const DEFAULT_EFFORT: ReasoningEffort = 'low';

export type OcrEngine = 'vision' | 'layout';

@Injectable()
export class ExtractorService {
  constructor(private readonly config: ConfigService) {}

  apiKey() {
    return (this.config.get<string>('GLM_API_KEY') ?? this.config.get<string>('ZAI_API_KEY') ?? '').trim();
  }

  baseUrl() {
    return (
      this.config.get<string>('GLM_BASE_URL') ??
      this.config.get<string>('ZAI_BASE_URL') ??
      'https://api.z.ai/api/paas/v4'
    );
  }

  model() {
    return this.config.get<string>('GLM_MODEL') ?? this.config.get<string>('ZAI_VISION_MODEL') ?? 'glm-5.3-flash';
  }

  /** `vision` = image chat/completions; `layout` = GLM-OCR + local table parse (+ optional flash header). */
  engine(): OcrEngine {
    const value = this.config.get<string>('OCR_ENGINE')?.trim().toLowerCase();
    return value === 'layout' ? 'layout' : 'vision';
  }

  structureModel() {
    return this.config.get<string>('GLM_LAYOUT_STRUCT_MODEL')?.trim() || DEFAULT_LAYOUT_STRUCT_MODEL;
  }

  tuning(): VisionTuning {
    const effort = this.config.get<string>('GLM_REASONING_EFFORT')?.trim().toLowerCase() as ReasoningEffort | undefined;
    const maxEdge = Number(this.config.get<string>('VISION_MAX_EDGE'));
    const headerModel = this.config.get<string>('GLM_HEADER_MODEL')?.trim();
    // Compact is on unless explicitly disabled: fewer output tokens is the main lever under the 20 s target (F-17).
    const compact = this.config.get<string>('GLM_COMPACT_OUTPUT')?.trim().toLowerCase() !== 'false';
    return {
      effort: effort && EFFORTS.includes(effort) ? effort : DEFAULT_EFFORT,
      ...(Number.isFinite(maxEdge) && maxEdge >= 640 ? { maxEdge } : {}),
      ...(headerModel ? { headerModel } : {}),
      compact,
    };
  }

  extractFromImage(image: Buffer, mimeType?: string): Promise<ExtractDocumentResult> {
    const input = {
      apiKey: this.apiKey(),
      baseUrl: this.baseUrl(),
      model: this.model(),
      image,
      mimeType,
      tuning: this.tuning(),
    };
    return this.engine() === 'layout'
      ? extractDocumentViaLayout({ ...input, structureModel: this.structureModel() })
      : extractDocumentFromImage(input);
  }
}
