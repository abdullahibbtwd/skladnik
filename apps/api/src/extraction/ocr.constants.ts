export const OCR_QUEUE = 'document-ocr';
export const OCR_JOB_EXTRACT = 'extract-capture';

export type OcrJobData = {
  captureId: string;
  documentId: string;
  companyId: string;
};
