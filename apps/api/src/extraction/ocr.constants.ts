export const OCR_QUEUE = 'document-ocr';
export const OCR_JOB_EXTRACT = 'extract-capture';

export const OCR_JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};

export function ocrJobId(captureId: string) {
  return `ocr-${captureId}`;
}

export type OcrJobData = {
  captureId: string;
  documentId: string;
  companyId: string;
};
