import type { ConfigType } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Client } from '@opensearch-project/opensearch';
import { opensearchConfig } from '../src/platform/search/opensearch.config.js';
import {
  OPENSEARCH,
  OpenSearchModule,
} from '../src/platform/search/opensearch.module.js';
import { indexBody } from '../src/processing/infrastructure/search/text-index.mapping.js';

// The analyzers' rules live in OpenSearch, so they're checked there, through
// the fields the mapping gives them: however a student spells a word, it
// meets the text's spelling. They fold precomposed letters only, so they get
// NFC text here, as they will from the code that writes and queries the index.
describe('text index analyzers', () => {
  let module: TestingModule;
  let opensearch: Client;
  let index: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [OpenSearchModule],
    }).compile();
    opensearch = module.get(OPENSEARCH);
    const { prefix } = module.get<ConfigType<typeof opensearchConfig>>(
      opensearchConfig.KEY,
    );
    index = `${prefix}-analysis`;
    await opensearch.indices.create({ index, body: indexBody(null) });
  });

  afterAll(() => module.close());

  const tokens = async (field: string, text: string) => {
    const { body } = await opensearch.indices.analyze({
      index,
      body: { field, text },
    });
    return body.tokens!.map(({ token }) => token);
  };

  describe.each(['text', 'text.sr'])('%s', (field) => {
    it.each([
      ['Ђорђе', 'Đorđe', 'Djordje', 'Dorde', 'DJORDJE'],
      ['џеп', 'džep', 'dzep', 'ǆep', 'ЏЕП'],
      ['полажу', 'polažu', 'polazu'],
      ['љубав', 'ljubav', 'ǉubav', 'LJUBAV'],
      ['њега', 'njega', 'ǌega'],
      ['конјункција', 'konjunkcija'],
      ['čas', 'час', 'cas'],
      ['Čačak', 'Чачак', 'Cacak'],
    ])('takes %s as its other spellings', async (word, ...others) => {
      const expected = await tokens(field, word);
      expect(expected).toHaveLength(1);
      for (const other of others)
        expect(await tokens(field, other)).toEqual(expected);
    });
  });

  it.each([
    [['semafor', 'semafora', 'semaforima', 'семафорима'], 'semafor'],
    [['mreža', 'mreže', 'mrežama', 'мрежама'], 'mrez'],
    [['procesor', 'procesora'], 'procesor'],
  ])('text.sr stems %j to %s', async (words, stem) => {
    for (const word of words)
      expect(await tokens('text.sr', word)).toEqual([stem]);
  });

  it('text.code keeps identifiers whole and splits them', async () => {
    expect(
      await tokens(
        'text.code',
        'System.out.println camelCaseName snake_case_name src/main.c IOException',
      ),
    ).toEqual(
      expect.arrayContaining([
        'system.out.println',
        'println',
        'camelcasename',
        'camel',
        'snake_case_name',
        'snake',
        'src/main.c',
        'main',
        'ioexception',
        'exception',
      ]),
    );
  });
});
