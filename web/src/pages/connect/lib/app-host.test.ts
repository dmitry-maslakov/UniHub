import { describe, expect, it } from 'vitest';
import { appHost } from './app-host';

describe('appHost', () => {
  it("names an app by its client_id's host, or by the id when it isn't an address", () => {
    expect(appHost('https://agent.example/oauth/client.json')).toBe(
      'agent.example',
    );
    expect(appHost('http://localhost:8080/client')).toBe('localhost:8080');
    expect(appHost('desktop-client')).toBe('desktop-client');
    expect(appHost('mailto:')).toBe('mailto:');
  });
});
