import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';

describe('privacy policy', () => {
  it('is open to someone signed out, and says who to write to', async () => {
    const { router } = renderApp('/privacy');

    expect(
      await screen.findByRole('heading', { name: 'Privacy policy' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/privacy');
    expect(screen.getByText('Last updated 2026-11-06')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', {
        name: 'unihub-support@googlegroups.com',
      })[0],
    ).toHaveAttribute('href', 'mailto:unihub-support@googlegroups.com');
  });

  it('is linked from the sign-in page', async () => {
    renderApp('/sign-in');

    expect(
      await screen.findByRole('link', { name: 'Privacy' }),
    ).toHaveAttribute('href', '/privacy');
  });
});
