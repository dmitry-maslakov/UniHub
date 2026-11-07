import { describe, expect, it } from 'vitest';
import type { Schemas } from '@/shared/api';
import { statusText } from './status';

const canvas: Schemas['PortalResponse'] = {
  portal: 'canvas',
  label: 'Canvas',
  mode: 'token',
  linked: true,
  instance: 'https://canvas.example.edu',
  status: 'linked',
  expiresAt: '2026-12-30T08:00:00.000Z',
  picked: null,
};

describe("a source's status", () => {
  it('names the school it is linked to and until when', () => {
    expect(statusText(canvas)).toBe(
      'Linked to canvas.example.edu. The token works until Dec 30, 2026.',
    );
    expect(statusText({ ...canvas, instance: null, expiresAt: null })).toBe(
      'Linked.',
    );
  });

  it('says what to do once the token stops working', () => {
    expect(statusText({ ...canvas, status: 'expired' })).toMatch(
      /expired. Replace it/,
    );
    expect(statusText({ ...canvas, status: 'revoked' })).toMatch(
      /^Canvas no longer takes your token/,
    );
    expect(
      statusText({ ...canvas, linked: false, status: null, instance: null }),
    ).toBe('Not linked.');
  });
});
