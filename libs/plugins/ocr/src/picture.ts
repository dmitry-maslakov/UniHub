import sharp from 'sharp';

// A picture whose short side is under this isn't read: an icon, a bullet
export const MIN_SIDE = 48;
// pictures past this many pixels aren't opened (a decompression bomb)
export const MAX_PIXELS = 100_000_000;
// a small picture is read at twice its size, which found 23% more
// confident words on screenshots; a large one is fitted inside this
const ENLARGE_BELOW = 1600;
const FIT_INSIDE = 4000;

// A picture as Tesseract reads best: upright, on white, grey, and big
// enough. The same for a file that is an image and for a deck's. Null when
// it's too small to hold text; throws when sharp can't read it.
export async function preparePicture(data: Buffer) {
  const image = sharp(data, { limitInputPixels: MAX_PIXELS });
  const { width, height } = await image.metadata();
  if (Math.min(width, height) < MIN_SIDE) return null;
  const upright = image
    .rotate() // by EXIF
    .flatten({ background: '#ffffff' })
    .greyscale()
    .toColourspace('b-w'); // one channel, not three of the same
  // a quarter turn swaps the sides, not the long one: a box of twice it
  // fits the picture at twice its size either way
  const long = Math.max(width, height);
  return (
    long < ENLARGE_BELOW
      ? upright.resize({ width: long * 2, height: long * 2, fit: 'inside' })
      : upright.resize({
          width: FIT_INSIDE,
          height: FIT_INSIDE,
          fit: 'inside',
          withoutEnlargement: true,
        })
  )
    .png({ compressionLevel: 1 })
    .toBuffer();
}

// A page PDFium drew, RGBA, as it is: no resizing, it was drawn big enough.
export function pagePicture(raw: Uint8Array, width: number, height: number) {
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .flatten({ background: '#ffffff' })
    .greyscale()
    .toColourspace('b-w')
    .png({ compressionLevel: 1 })
    .toBuffer();
}
