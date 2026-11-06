import { MAX_CHARS, OfficeParserHtmlText } from './officeparser-html-text.js';

describe('OfficeParserHtmlText', () => {
  const html = new OfficeParserHtmlText();

  it('reads each string as office-text reads a page: tags, scripts and styles left out, entities decoded, plain text as it is', async () => {
    expect(
      await html.textsOf([
        '<p>The exam is on <b>Monday</b> &amp; Tuesday.</p><script>track()</script><style>p{}</style><ul><li>room 1</li></ul>',
        'Bring a pen, a < b',
      ]),
    ).toEqual([
      'The exam is on Monday & Tuesday.\n- room 1',
      'Bring a pen, a < b',
    ]);
  });

  it('reads one it refuses as nothing, the others as they are', async () => {
    const deep = `${'<div>'.repeat(300)}deep${'</div>'.repeat(300)}`;

    expect(await html.textsOf(['kept', deep])).toEqual(['kept', '']);
  });

  it('reads none of strings past its limit, nor starts a thread for none', async () => {
    await expect(html.textsOf(['x'.repeat(MAX_CHARS + 1)])).rejects.toThrow(
      `past ${MAX_CHARS}`,
    );
    expect(await html.textsOf([])).toEqual([]);
  });
});
