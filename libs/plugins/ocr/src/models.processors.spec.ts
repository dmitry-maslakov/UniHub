import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import { ZipFile } from 'yazl';
import {
  ContentHash,
  ModelUnavailableError,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { readerSettings, visionSettings } from './models.config.js';
import {
  MODEL_MAX_PAGES,
  ReaderProcessor,
  VisionProcessor,
} from './models.processors.js';

const file = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name));

const input = (
  name: string,
  data: Buffer,
  signal?: AbortSignal,
): ProcessorInput => ({
  name,
  mime: null,
  matched: extname(name),
  hash: ContentHash.parse('0'.repeat(64)),
  content: async () => Readable.from([data]),
  signal,
});

// A deck of `n` slides, each with `pictures` copies of one picture.
async function deckOf(n: number, pictures = 1) {
  const NS =
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const rels = (body: string) =>
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
  const slides = Array.from({ length: n }, (_, i) => i + 1);
  const ids = Array.from({ length: pictures }, (_, i) => i + 1);
  const zip = new ZipFile();
  const add = (data: string | Buffer, name: string) =>
    zip.addBuffer(Buffer.from(data), name);
  add(
    `<p:presentation ${NS}><p:sldIdLst>${slides.map((i) => `<p:sldId id="${255 + i}" r:id="rId${i}"/>`).join('')}</p:sldIdLst></p:presentation>`,
    'ppt/presentation.xml',
  );
  add(
    rels(
      slides
        .map(
          (i) =>
            `<Relationship Id="rId${i}" Type="slide" Target="slides/slide${i}.xml"/>`,
        )
        .join(''),
    ),
    'ppt/_rels/presentation.xml.rels',
  );
  for (const i of slides) {
    add(
      `<p:sld ${NS}><p:cSld><p:spTree>${ids.map((id) => `<p:pic><p:blipFill><a:blip r:embed="rId${id}"/></p:blipFill></p:pic>`).join('')}</p:spTree></p:cSld></p:sld>`,
      `ppt/slides/slide${i}.xml`,
    );
    add(
      rels(
        ids
          .map(
            (id) =>
              `<Relationship Id="rId${id}" Type="image" Target="../media/image.png"/>`,
          )
          .join(''),
      ),
      `ppt/slides/_rels/slide${i}.xml.rels`,
    );
  }
  add(file('latin.png'), 'ppt/media/image.png');
  zip.end();
  return buffer(zip.outputStream);
}

interface Asked {
  url: string;
  body: {
    messages: { role: string; content: Record<string, any>[] }[];
    max_tokens: number;
    temperature: number;
    chat_template_kwargs: unknown;
  };
}

// The model server: records what it's asked and answers by `reply`.
type Reply = (n: number, req: IncomingMessage) => Promise<[number, unknown]>;

const says = (text: string): [number, unknown] => [
  200,
  { choices: [{ message: { content: text } }] },
];

describe.each([
  {
    name: 'reader',
    make: (url: string) => new ReaderProcessor({ url }),
    prompt: 'OCR:',
    imageFirst: true,
    maxTokens: 1500,
  },
  {
    name: 'vision',
    make: (url: string) => new VisionProcessor({ url }),
    prompt:
      'Describe what this picture shows, in English, in two sentences. Transcribe any formula as LaTeX. If there is no formula, say nothing about formulas.',
    imageFirst: false,
    maxTokens: 300,
  },
])('$name', ({ make, prompt, imageFirst, maxTokens }) => {
  let server: Server;
  let url: string;
  let asked: Asked[];
  let reply: Reply;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    asked = [];
    reply = async (n) => says(`answer ${n}`);
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        asked.push({
          url: req.url!,
          body: JSON.parse(Buffer.concat(chunks).toString()),
        });
        void reply(asked.length, req).then(([status, body]) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body));
        });
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });

  describe('an image', () => {
    it('is put to the model as a JPEG with its prompt', async () => {
      const png = file('latin.png');
      const { parts } = await make(url).process(input('a.png', png));

      expect(parts).toEqual(['answer 1']);
      const [{ url: path, body }] = asked;
      expect(path).toBe('/v1/chat/completions');
      expect(body).toMatchObject({
        max_tokens: maxTokens,
        temperature: 0,
        chat_template_kwargs: { enable_thinking: false },
      });
      expect(body.messages).toHaveLength(1);
      const [message] = body.messages;
      expect(message.role).toBe('user');
      const kinds = message.content.map((part) => part.type);
      expect(kinds).toEqual(
        imageFirst ? ['image_url', 'text'] : ['text', 'image_url'],
      );
      expect(message.content.find((p) => p.type === 'text')!.text).toBe(prompt);
      const sent = message.content.find((p) => p.type === 'image_url')!
        .image_url.url as string;
      expect(sent).toMatch(/^data:image\/jpeg;base64,/);
      const jpeg = Buffer.from(sent.split(',')[1], 'base64');
      // 1600 wide already: fitted inside 1600 without growing, in colour
      expect(await sharp(jpeg).metadata()).toMatchObject({
        format: 'jpeg',
        width: 1600,
        height: 240,
        channels: 3,
      });
    });

    it('is not enlarged, and a large one is fitted inside 1600', async () => {
      const small = await sharp(file('latin.png')).resize(400).toBuffer();
      const large = await sharp(file('latin.png')).resize(3200).toBuffer();
      await make(url).process(input('small.png', small));
      await make(url).process(input('large.png', large));

      const widths = await Promise.all(
        asked.map(async ({ body }) => {
          const part = body.messages[0].content.find(
            (p) => p.type === 'image_url',
          )!;
          const data = Buffer.from(part.image_url.url.split(',')[1], 'base64');
          return (await sharp(data).metadata()).width;
        }),
      );
      expect(widths).toEqual([400, 1600]);
    });

    it('takes what the model says trimmed, and none of it as no parts', async () => {
      reply = async () => says('  two sentences.\n');
      expect(
        await make(url).process(input('a.png', file('latin.png'))),
      ).toEqual({ parts: ['two sentences.'] });

      reply = async () => says('');
      expect(
        await make(url).process(input('a.png', file('latin.png'))),
      ).toEqual({ parts: [] });
    });

    it('is not put to the model when too small', async () => {
      expect(await make(url).process(input('t.png', file('tiny.png')))).toEqual(
        { parts: [] },
      );
      expect(asked).toHaveLength(0);
    });

    it('is a warning, not a failure, when it is corrupt', async () => {
      expect(
        await make(url).process(input('x.png', Buffer.from('nope'))),
      ).toEqual({ parts: [] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('x.png'));
      expect(asked).toHaveLength(0);
    });
  });

  describe('a pdf', () => {
    it('has its text-less pages put to the model, by their number', async () => {
      reply = async (n) => says(n === 2 ? '' : `answer ${n}`);

      expect(
        await make(url).process(input('m.pdf', file('mixed.pdf'))),
      ).toEqual({ parts: ['', 'answer 1', ''] });
      expect(asked).toHaveLength(2);
      const sent = asked[0].body.messages[0].content.find(
        (p) => p.type === 'image_url',
      )!.image_url.url as string;
      expect(sent).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('is not put to the model when every page has its text', async () => {
      expect(await make(url).process(input('t.pdf', file('text.pdf')))).toEqual(
        { parts: [] },
      );
      expect(asked).toHaveLength(0);
    });
  });

  describe('a deck', () => {
    it("has a slide's pictures joined by a blank line", async () => {
      const deck = await deckOf(2, 2);

      expect(await make(url).process(input('d.pptx', deck))).toEqual({
        parts: ['answer 1\n\nanswer 2', 'answer 3\n\nanswer 4'],
      });
    });

    it(`reads ${MODEL_MAX_PAGES} slides of a file and leaves the rest empty`, async () => {
      const { parts } = await make(url).process(
        input('long.pptx', await deckOf(MODEL_MAX_PAGES + 1)),
      );

      expect(asked).toHaveLength(MODEL_MAX_PAGES);
      expect(parts).toHaveLength(MODEL_MAX_PAGES + 1);
      expect(parts[MODEL_MAX_PAGES]).toBe('');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('1 of 201 pages left unread'),
      );
    }, 120_000);

    it('stops past the deadline of 170 minutes, checked before each slide', async () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      reply = async (n) => {
        if (n === 1) now += 170 * 60_000 + 1;
        return says(`answer ${n}`);
      };

      const { parts } = await make(url).process(
        input('slow.pptx', await deckOf(3)),
      );

      expect(parts).toEqual(['answer 1', '', '']);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('2 of 3 pages left unread'),
      );
    });
  });

  describe('when the model', () => {
    it.each([503, 500])('answers %i, the job waits', async (status) => {
      reply = async () => [status, { error: 'loading' }];

      await expect(
        make(url).process(input('a.png', file('latin.png'))),
      ).rejects.toBeInstanceOf(ModelUnavailableError);
    });

    it('refuses the connection, the job waits and nothing is stored', async () => {
      await new Promise((done) => server.close(done));

      await expect(
        make(url).process(input('m.pdf', file('mixed.pdf'))),
      ).rejects.toBeInstanceOf(ModelUnavailableError);
    });

    it('is not found by name, the job waits', async () => {
      await expect(
        make('http://model.invalid').process(input('a.png', file('latin.png'))),
      ).rejects.toBeInstanceOf(ModelUnavailableError);
    });

    it('answers 4xx, that picture is empty and the next is read', async () => {
      reply = async (n) => (n === 1 ? [400, { error: 'bad' }] : says('ok'));

      expect(await make(url).process(input('d.pptx', await deckOf(2)))).toEqual(
        { parts: ['', 'ok'] },
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('d.pptx'));
    });

    it('takes too long over a picture, that one is empty and the next is read', async () => {
      const real = AbortSignal.timeout.bind(AbortSignal);
      vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => real(1000));
      reply = async (n) => {
        if (n === 1) await new Promise((done) => setTimeout(done, 2000));
        return says('ok');
      };

      expect(await make(url).process(input('d.pptx', await deckOf(2)))).toEqual(
        { parts: ['', 'ok'] },
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('d.pptx'));
    });
  });

  describe('the input signal', () => {
    it('aborts a picture being read, with its reason', async () => {
      const controller = new AbortController();
      reply = async () => {
        controller.abort(new Error('shutting down'));
        await new Promise((done) => setTimeout(done, 300));
        return says('late');
      };

      await expect(
        make(url).process(input('a.png', file('latin.png'), controller.signal)),
      ).rejects.toThrow('shutting down');
    });

    it('stops a file before its next page', async () => {
      const controller = new AbortController();
      reply = async (n) => {
        controller.abort(new Error('timed out'));
        return says(`answer ${n}`);
      };

      await expect(
        make(url).process(input('d.pptx', await deckOf(3), controller.signal)),
      ).rejects.toThrow('timed out');
      expect(asked).toHaveLength(1);
    });
  });
});

describe('the model settings', () => {
  it.each([
    ['READER_URL', readerSettings],
    ['VISION_URL', visionSettings],
  ] as const)('take %s as an http or https URL', (key, schema) => {
    expect(schema.parse({ [key]: 'http://llama:8080' })).toEqual({
      url: 'http://llama:8080',
    });
    expect(schema.parse({ [key]: 'https://llama.example' }).url).toBe(
      'https://llama.example',
    );
    for (const bad of [undefined, '', 'llama:8080', 'ftp://llama', 'file:///x'])
      expect(schema.safeParse({ [key]: bad }).success, String(bad)).toBe(false);
  });
});
