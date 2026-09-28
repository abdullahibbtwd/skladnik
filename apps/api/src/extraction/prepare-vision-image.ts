import { createCanvas, loadImage } from '@napi-rs/canvas';

const MAX_EDGE = 2048;
const MAX_BYTES = 1_800_000;

export async function prepareVisionImage(buffer: Buffer, mimeType?: string) {
  const fallbackType = mimeType?.startsWith('image/') ? mimeType : 'image/jpeg';
  try {
    const image = await loadImage(buffer);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const alreadySmall = scale === 1 && buffer.length <= MAX_BYTES && fallbackType === 'image/jpeg';
    if (alreadySmall) {
      return { buffer, mimeType: fallbackType };
    }
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    const jpeg = canvas.toBuffer('image/jpeg', 0.82);
    return { buffer: jpeg, mimeType: 'image/jpeg' as const };
  } catch {
    return { buffer, mimeType: fallbackType };
  }
}
