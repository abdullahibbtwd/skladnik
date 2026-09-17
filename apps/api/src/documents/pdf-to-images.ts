import { createRequire } from 'node:module';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { createCanvas, type Canvas } from '@napi-rs/canvas';

export const MAX_PDF_PAGES = 20;
const PDF_SCALE = 2;

const nodeRequire = createRequire(__filename);
const pdfjsRoot = path.dirname(nodeRequire.resolve('pdfjs-dist/package.json'));

export function isPdfUpload(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>) {
  const mime = (file.mimetype ?? '').toLowerCase();
  const name = (file.originalname ?? '').toLowerCase();
  return mime === 'application/pdf' || mime === 'application/x-pdf' || name.endsWith('.pdf');
}

export function isImageUpload(file: Pick<Express.Multer.File, 'mimetype'>) {
  return (file.mimetype ?? '').toLowerCase().startsWith('image/');
}

export function assertCaptureUpload(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>) {
  if (isPdfUpload(file) || isImageUpload(file)) return;
  throw new BadRequestException('Only photos and PDF files can be attached.');
}

type CanvasAndContext = {
  canvas: Canvas | null;
  context: ReturnType<Canvas['getContext']> | null;
};

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number) {
    if (!canvasAndContext.canvas) return;
    canvasAndContext.canvas.width = Math.ceil(width);
    canvasAndContext.canvas.height = Math.ceil(height);
  }

  destroy(canvasAndContext: CanvasAndContext) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

export async function pdfToPngPages(file: Express.Multer.File): Promise<Express.Multer.File[]> {
  if (!file.buffer?.length) {
    throw new BadRequestException('The PDF file is empty.');
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const canvasFactory = new NodeCanvasFactory();
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(file.buffer),
    CanvasFactory: NodeCanvasFactory,
    disableFontFace: true,
    verbosity: 0,
    useSystemFonts: true,
    useWorkerFetch: false,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    cMapUrl: `${path.join(pdfjsRoot, 'cmaps')}${path.sep}`,
    cMapPacked: true,
    standardFontDataUrl: `${path.join(pdfjsRoot, 'standard_fonts')}${path.sep}`,
  });

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      throw new BadRequestException('This PDF is password-protected.');
    }
    throw new BadRequestException('Could not read this PDF.');
  }

  if (pdf.numPages < 1) {
    await loadingTask.destroy().catch(() => undefined);
    throw new BadRequestException('This PDF has no pages.');
  }
  if (pdf.numPages > MAX_PDF_PAGES) {
    await loadingTask.destroy().catch(() => undefined);
    throw new BadRequestException(`PDFs are limited to ${MAX_PDF_PAGES} pages.`);
  }

  const base = (file.originalname || 'invoice').replace(/\.pdf$/i, '') || 'invoice';
  const pages: Express.Multer.File[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_SCALE });
      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
      await page.render({
        canvas: canvasAndContext.canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const png = Buffer.from(canvasAndContext.canvas.toBuffer('image/png'));
      canvasFactory.destroy(canvasAndContext);
      pages.push({
        ...file,
        buffer: png,
        originalname: `${base}-p${pageNumber}.png`,
        mimetype: 'image/png',
        size: png.length,
      });
    }
  } finally {
    await pdf.cleanup();
    await loadingTask.destroy();
  }

  return pages;
}
