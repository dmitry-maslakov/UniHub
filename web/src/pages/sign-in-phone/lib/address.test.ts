import { describe, expect, it } from 'vitest';
import { typedAddress } from './address';

describe('typedAddress', () => {
  it('leaves out the scheme, and the query', () => {
    expect(typedAddress('https://uni.test/device')).toBe('uni.test/device');
    expect(typedAddress('http://localhost:3000/device?x=1')).toBe(
      'localhost:3000/device',
    );
  });
});
