import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';
import { server } from './server';

// what jsdom lacks and Mantine reads (Mantine's Vitest guide)
const { getComputedStyle } = window;
window.getComputedStyle = (element) => getComputedStyle(element);
window.HTMLElement.prototype.scrollIntoView = () => {};
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// every request the app makes is one a test answers. Listening before the
// specs import the app: its clients keep the fetch they find at creation
server.listen({ onUnhandledFrame: 'error' });
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
