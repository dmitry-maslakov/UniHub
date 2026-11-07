import { describe, expect, it } from 'vitest';
import type { Schemas } from '@/shared/api';
import { formatters, i18n } from '@/shared/i18n';
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

const t = i18n.getFixedT('en', 'sources');
const date = formatters('en').date;

describe("a source's status", () => {
  it('names the school it is linked to and until when', () => {
    expect(statusText(t, canvas, date)).toBe(
      'Linked to canvas.example.edu. The token works until Dec 30, 2026.',
    );
    expect(
      statusText(t, { ...canvas, instance: null, expiresAt: null }, date),
    ).toBe('Linked.');
    expect(statusText(t, { ...canvas, instance: null }, date)).toBe(
      'Linked. The token works until Dec 30, 2026.',
    );
    expect(statusText(t, { ...canvas, expiresAt: null }, date)).toBe(
      'Linked to canvas.example.edu.',
    );
  });

  it('says what to do once the token stops working', () => {
    expect(statusText(t, { ...canvas, status: 'expired' }, date)).toMatch(
      /expired. Replace it/,
    );
    expect(statusText(t, { ...canvas, status: 'revoked' }, date)).toMatch(
      /^Canvas no longer takes your token/,
    );
    expect(
      statusText(
        t,
        { ...canvas, linked: false, status: null, instance: null },
        date,
      ),
    ).toBe('Not linked.');
  });

  it('says it in Serbian too', () => {
    expect(
      statusText(
        i18n.getFixedT('sr-Latn', 'sources'),
        canvas,
        formatters('sr-Latn').date,
      ),
    ).toBe('Povezano sa canvas.example.edu. Token važi do 30. dec 2026.');
  });
});
