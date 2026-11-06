import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { auth, server, signedIn } from './server';

describe('approving a screen', () => {
  it('shows its code and who it signs in, then approves it', async () => {
    signedIn();
    let status = 'pending';
    server.use(
      http.get(auth('/device'), ({ request }) => {
        expect(new URL(request.url).searchParams.get('user_code')).toBe(
          'ABCD2345',
        );
        return HttpResponse.json({
          user_code: 'ABCD2345',
          status,
          client_id: 'unihub-web',
        });
      }),
      http.post(auth('/device/approve'), () => {
        status = 'approved';
        return HttpResponse.json({ success: true });
      }),
    );
    renderApp('/device?user_code=abcd-2345');

    expect(await screen.findByText('ABCD-2345')).toBeVisible();
    expect(
      screen.getByText(/UniHub in a browser wants to sign in as/),
    ).toHaveTextContent('ana@uni.test');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approved')).toBeVisible();
  });

  it('asks for the code when the screen gave none', async () => {
    signedIn();
    const { router } = renderApp('/device');
    await userEvent.type(
      await screen.findByLabelText('Code on the screen'),
      'wxyz-2345',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(router.state.location.search).toEqual({ user_code: 'WXYZ2345' });
  });
});
