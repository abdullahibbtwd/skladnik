import { createCanvas, loadImage } from '@napi-rs/canvas';

/** quality is on @napi-rs/canvas's 0–100 scale; a 0–1 value silently encodes at the lowest quality. */
export const VISION_IMAGE_DEFAULTS = { maxEdge: 2048, quality: 85, maxBytes: 1_800_000 };

export type VisionImageOptions = Partial<typeof VISION_IMAGE_DEFAULTS>;

export async function prepareVisionImage(buffer: Buffer, mimeType?: string, options: VisionImageOptions = {}) {
  const { maxEdge, quality, maxBytes } = { ...VISION_IMAGE_DEFAULTS, ...options };
  const fallbackType = mimeType?.startsWith('image/') ? mimeType : 'image/jpeg';
  try {
    const image = await loadImage(buffer);
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const alreadySmall = scale === 1 && buffer.length <= maxBytes && fallbackType === 'image/jpeg';
    if (alreadySmall) {
      return { buffer, mimeType: fallbackType, width: image.width, height: image.height };
    }
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    const jpeg = canvas.toBuffer('image/jpeg', quality);
    return { buffer: jpeg, mimeType: 'image/jpeg' as const, width, height };
  } catch {
    return { buffer, mimeType: fallbackType, width: null, height: null };
  }
}
