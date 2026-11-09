import { viewKind } from './viewable.js';

describe('viewKind', () => {
  it('takes images and PDFs by media type', () => {
    expect(viewKind('image/png', 'x')).toBe('image');
    expect(viewKind('IMAGE/JPEG; q=1', 'x')).toBe('image');
    expect(viewKind('image/gif', 'x')).toBe('image');
    expect(viewKind('image/webp', 'x')).toBe('image');
    expect(viewKind('application/pdf', 'x')).toBe('pdf');
  });

  it('falls back to the extension when the type says nothing', () => {
    expect(viewKind(null, 'scan.JPG')).toBe('image');
    expect(viewKind('application/octet-stream', 'a.jpeg')).toBe('image');
    expect(viewKind(null, 'a.webp')).toBe('image');
    expect(viewKind('', 'notes.pdf')).toBe('pdf');
  });

  it('never takes SVG, a deck or text', () => {
    expect(viewKind('image/svg+xml', 'logo.png')).toBeNull();
    expect(viewKind(null, 'logo.svg')).toBeNull();
    expect(
      viewKind(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'a.pptx',
      ),
    ).toBeNull();
    expect(viewKind('text/plain', 'a.txt')).toBeNull();
    expect(viewKind(null, 'noextension')).toBeNull();
  });
});
