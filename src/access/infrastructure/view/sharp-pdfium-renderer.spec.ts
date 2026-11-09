import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  NotReadableError,
  NotViewableError,
} from '../../application/errors.js';
import { MAX_SIDE } from './jpeg.js';
import { SharpPdfiumRenderer } from './sharp-pdfium-renderer.js';

const lecture = readFileSync(
  new URL(
    '../../../../libs/plugins/office-text/src/fixtures/lecture.pdf',
    import.meta.url,
  ),
);
const renderer = new SharpPdfiumRenderer();

const sizeOf = async (data: Buffer) => {
  const { format, width, height } = await sharp(data).metadata();
  return { format, width, height };
};
const png = (width: number, height: number, channels: 3 | 4 = 4) =>
  sharp({
    create: {
      width,
      height,
      channels,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();

describe('SharpPdfiumRenderer', () => {
  it('fits an image inside the size, never enlarging it', async () => {
    expect(await sizeOf(await renderer.image(await png(3136, 1568)))).toEqual({
      format: 'jpeg',
      width: MAX_SIDE,
      height: MAX_SIDE / 2,
    });
    expect(await sizeOf(await renderer.image(await png(800, 3200)))).toEqual({
      format: 'jpeg',
      width: 392,
      height: MAX_SIDE,
    });
    expect(await sizeOf(await renderer.image(await png(200, 100)))).toEqual({
      format: 'jpeg',
      width: 200,
      height: 100,
    });
  });

  it('puts a transparent image on white, and applies its EXIF turn', async () => {
    const jpeg = await renderer.image(await png(10, 10));
    const { data } = await sharp(jpeg)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // half-transparent red over white is a pale red
    expect(data[0]).toBe(255);
    expect(data[1]).toBeGreaterThan(100);

    const turned = await sharp(await png(200, 100, 3))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect(await sizeOf(await renderer.image(turned))).toMatchObject({
      width: 100,
      height: 200,
    });
  });

  it('refuses what is not an image', async () => {
    await expect(renderer.image(Buffer.from('not one'))).rejects.toBeInstanceOf(
      NotViewableError,
    );
  });

  it('draws a page of a PDF, the long side at the size, and counts its pages', async () => {
    const { data, pages } = await renderer.pdf(lecture, 1);
    expect(pages).toBeGreaterThan(0);
    const { format, width, height } = await sizeOf(data);
    expect(format).toBe('jpeg');
    expect(Math.max(width!, height!)).toBe(MAX_SIDE);
  });

  it('finds no page past the last, and refuses a PDF that is not one', async () => {
    const { pages } = await renderer.pdf(lecture, 1);
    await expect(renderer.pdf(lecture, pages + 1)).rejects.toThrowError(
      new NotReadableError('page'),
    );
    await expect(
      renderer.pdf(Buffer.from('%PDF-1.4 broken'), 1),
    ).rejects.toBeInstanceOf(NotViewableError);
  });
});
