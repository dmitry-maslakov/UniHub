import { ingestSettings } from './ingest.config.js';

const tokens = (CONNECTOR_TOKENS: string) =>
  ingestSettings.safeParse({ CONNECTOR_TOKENS });

describe('CONNECTOR_TOKENS', () => {
  it('maps each token to its portal', () => {
    expect(tokens('').data?.tokens.size).toBe(0);
    const { data } = tokens('acs=0123456789abcdef, teams=fedcba9876543210');
    expect([...data!.tokens]).toEqual([
      ['0123456789abcdef', 'acs'],
      ['fedcba9876543210', 'teams'],
    ]);
  });

  it('refuses what would quietly lock a connector out', () => {
    for (const bad of [
      'acs0123456789abcdef',
      'acs=short',
      'ACS=0123456789abcdef',
      'a=0123456789abcdef,b=0123456789abcdef',
    ])
      expect(tokens(bad).success).toBe(false);
  });
});
