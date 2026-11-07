import { describe, expect, it } from 'vitest';
import { defaultTab } from './default-tab';

describe('defaultTab', () => {
  it('opens files while they load and when there are some, posts when there are none', () => {
    expect(defaultTab(undefined)).toBe('files');
    expect(defaultTab(62)).toBe('files');
    expect(defaultTab(0)).toBe('posts');
  });
});
