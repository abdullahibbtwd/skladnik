import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractDocumentFromImage, type ExtractDocumentResult } from './extract-document';

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
    return this.config.get<string>('GLM_MODEL') ?? this.config.get<string>('ZAI_VISION_MODEL') ?? 'glm-5v-turbo';
  }

  extractFromImage(image: Buffer, mimeType?: string): Promise<ExtractDocumentResult> {
    return extractDocumentFromImage({
      apiKey: this.apiKey(),
      baseUrl: this.baseUrl(),
      model: this.model(),
      image,
      mimeType,
    });
  }
}
