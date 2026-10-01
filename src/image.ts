export const WEBP_QUALITY = 0.85;

/** Thrown when a file can't be decoded or encoded as WebP. apiErr() localizes `code`. */
export class ImageError extends Error {
  code = 'image_convert';
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageError('Image could not be transcoded.'));
    img.src = url;
  });
}

/**
 * Encode a canvas as WebP. Chrome/Firefox/Edge do it natively; Safari/WebKit
 * can't (canvas.toBlob silently falls back to PNG), so there we encode with
 * the Squoosh WASM codec — lazily imported, so capable browsers never fetch it.
 */
async function encodeWebP(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  quality: number,
): Promise<Blob> {
  const native = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  );
  if (native && native.type === 'image/webp') return native;
  const { encode } = await import('@jsquash/webp');
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buf = await encode(pixels, { quality: Math.round(quality * 100) });
  return new Blob([buf], { type: 'image/webp' });
}

/**
 * Convert any browser-decodable image to a WebP File at the given quality.
 * Drawing via <img> bakes in EXIF orientation; animated sources flatten to
 * their first frame. Already-WebP inputs pass through — a second lossy
 * encode would only degrade them.
 */
export async function toWebP(file: File, quality = WEBP_QUALITY): Promise<File> {
  if (file.type === 'image/webp') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.width > 0 && canvas.height > 0 ? canvas.getContext('2d') : null;
    if (!ctx) throw new ImageError('Image could not be transcoded.');
    ctx.drawImage(img, 0, 0);
    const blob = await encodeWebP(canvas, ctx, quality);
    const name = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${name}.webp`, { type: 'image/webp' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Render a cropped (and optionally rotated) region of an image URL to a WebP
 * File. `crop` is in rotated-image pixels — the coordinate space react-easy-crop
 * reports. The source stays untouched; `src` is not revoked here (caller's job).
 */
export async function cropToWebP(
  src: string,
  crop: CropRect,
  rotationDeg: number,
  name: string,
  quality = WEBP_QUALITY,
): Promise<File> {
  const img = await load(src);
  const fail = () => new ImageError('Image could not be transcoded.');
  const rad = (rotationDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bw = Math.ceil(img.naturalWidth * cos + img.naturalHeight * sin);
  const bh = Math.ceil(img.naturalWidth * sin + img.naturalHeight * cos);

  const stage = document.createElement('canvas');
  stage.width = bw;
  stage.height = bh;
  const sctx = stage.getContext('2d');
  if (!sctx) throw fail();
  sctx.translate(bw / 2, bh / 2);
  sctx.rotate(rad);
  sctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const x = Math.min(Math.max(0, Math.round(crop.x)), bw - 1);
  const y = Math.min(Math.max(0, Math.round(crop.y)), bh - 1);
  const w = Math.min(Math.max(1, Math.round(crop.width)), bw - x);
  const h = Math.min(Math.max(1, Math.round(crop.height)), bh - y);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) throw fail();
  octx.putImageData(sctx.getImageData(x, y, w, h), 0, 0);

  const blob = await encodeWebP(out, octx, quality);
  const stem = name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${stem}.webp`, { type: 'image/webp' });
}
