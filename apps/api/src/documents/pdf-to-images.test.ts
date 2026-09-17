import { assertCaptureUpload, isImageUpload, isPdfUpload, pdfToPngPages } from './pdf-to-images';

function upload(partial: Partial<Express.Multer.File> & Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'buffer'>): Express.Multer.File {
  return {
    fieldname: 'file',
    encoding: '7bit',
    size: partial.buffer.length,
    destination: '',
    filename: partial.originalname,
    path: '',
    stream: undefined as unknown as Express.Multer.File['stream'],
    ...partial,
  };
}

async function run() {
  const png = upload({
    originalname: 'page.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff]),
  });
  if (!isImageUpload(png) || isPdfUpload(png)) {
    throw new Error('jpeg should be treated as an image');
  }
  assertCaptureUpload(png);

  const namedPdf = upload({
    originalname: 'invoice.PDF',
    mimetype: 'application/octet-stream',
    buffer: Buffer.from('%PDF'),
  });
  if (!isPdfUpload(namedPdf)) {
    throw new Error('filename should mark a PDF even when the mime type is generic');
  }

  try {
    assertCaptureUpload(upload({ originalname: 'notes.txt', mimetype: 'text/plain', buffer: Buffer.from('x') }));
    throw new Error('text files should be rejected');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('photos and PDF')) {
      throw error;
    }
  }

  const twoPagePdf = Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`,
    'utf8',
  );

  const pages = await pdfToPngPages(
    upload({
      originalname: 'delivery.pdf',
      mimetype: 'application/pdf',
      buffer: twoPagePdf,
    }),
  );

  if (pages.length !== 2) {
    throw new Error(`expected 2 PNG pages, got ${pages.length}`);
  }
  for (const [index, page] of pages.entries()) {
    if (page.mimetype !== 'image/png') {
      throw new Error(`page ${index + 1} should be image/png`);
    }
    if (!page.originalname.endsWith(`-p${index + 1}.png`)) {
      throw new Error(`unexpected page name ${page.originalname}`);
    }
    if (page.buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`page ${index + 1} is not a PNG`);
    }
  }

  console.log('pdf-to-images tests passed');
}

module.exports = run();
