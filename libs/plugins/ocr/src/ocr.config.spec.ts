import { ocrSettings } from './ocr.config.js';

describe('ocr settings', () => {
  it('read English only by default', () => {
    expect(ocrSettings.parse({}).languages).toEqual([
      { detect: 'eng', read: 'eng' },
    ]);
  });

  it('take candidates as detect, or detect=read', () => {
    expect(
      ocrSettings.parse({ OCR_LANGUAGES: 'srp_latn+eng, srp=srp+eng' })
        .languages,
    ).toEqual([
      { detect: 'srp_latn+eng', read: 'srp_latn+eng' },
      { detect: 'srp', read: 'srp+eng' },
    ]);
  });

  it('refuse what is not a Tesseract language value', () => {
    for (const bad of [
      '',
      'eng,',
      'ENG',
      'eng+',
      '+eng',
      'eng;rm',
      'eng ara',
      'a=b=c',
      '=eng',
      'eng=',
      '../eng',
    ])
      expect(ocrSettings.safeParse({ OCR_LANGUAGES: bad }).success, bad).toBe(
        false,
      );
  });
});
