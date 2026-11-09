import sharp, { type Sharp } from 'sharp';

// the longest side a picture is shown at: past it a model downsizes it anyway
export const MAX_SIDE = 1568;
// a source with more pixels than this is refused before it is decoded
const MAX_PIXELS = 64_000_000;

// An image's pixels, or a page's bitmap, as the one JPEG the hub shows: the
// EXIF turn applied (the metadata goes with it), fitted inside MAX_SIDE
// without enlarging, on white, the first frame of a gif.
export const toJpeg = (source: Sharp) =>
  source
    .rotate()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer();

export const imageToJpeg = (data: Buffer) =>
  toJpeg(sharp(data, { limitInputPixels: MAX_PIXELS }));
