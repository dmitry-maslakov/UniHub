import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { auth, refused, server, session, user } from './server';

describe('sign-in', () => {
  it('signs in and goes on to where it was asked to', async () => {
    let signedIn = false;
    server.use(
      http.get(auth('/get-session'), () =>
        HttpResponse.json(signedIn ? session : null),
      ),
      http.post(auth('/sign-in/email'), async ({ request }) => {
        expect(await request.json()).toEqual({
          email: 'ana@uni.test',
          password: 'pw',
        });
        signedIn = true;
        return HttpResponse.json({ redirect: false, token: 't', user });
      }),
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
    );
    const { router } = renderApp('/sign-in?next=/settings/api-keys');

    await userEvent.type(await screen.findByLabelText('Email'), 'ana@uni.test');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'API keys' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/api-keys');
  });

  it('says what went wrong', async () => {
    server.use(
      http.post(auth('/sign-in/email'), () =>
        refused(401, 'INVALID_EMAIL_OR_PASSWORD'),
      ),
    );
    renderApp('/sign-in');

    await userEvent.type(await screen.findByLabelText('Email'), 'ana@uni.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That email and password don't match an account",
    );
  });

  it('never goes to another site after signing in', async () => {
    renderApp('/sign-in?next=//evil.test');
    await screen.findByLabelText('Email');
    expect(
      screen
        .getByRole('link', { name: 'Create an account' })
        .getAttribute('href'),
    ).toBe('/sign-up?next=%2F%2Fevil.test');
    // the form itself goes to safeNext's '/', checked in safe-next.test
  });

  it('offers Google only when the hub has it', async () => {
    renderApp('/sign-in');
    await screen.findByLabelText('Email');
    expect(
      screen.queryByRole('button', { name: 'Continue with Google' }),
    ).toBeNull();

    server.use(
      http.get('http://localhost:3000/api/sign-in-methods', () =>
        HttpResponse.json({ google: true }),
      ),
    );
    renderApp('/sign-in');
    expect(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    ).toBeVisible();
  });

  it("keeps an OAuth client's signed query as it came", async () => {
    const query =
      '?client_id=app&ba_iat=1730000000&ba_param=ba_iat&ba_param=client_id&sig=a1';
    const { router } = renderApp(`/sign-in${query}`);
    await screen.findByLabelText('Email');
    expect(router.history.location.search).toBe(query);
    expect(
      screen
        .getByRole('link', { name: 'Create an account' })
        .getAttribute('href'),
    ).toBe(`/sign-up${query}`);
  });

  it('sends the signed out from an app page to sign in, and back', async () => {
    const { router } = renderApp('/device?user_code=ABCD2345');
    await screen.findByLabelText('Email');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        next: '/device?user_code=ABCD2345',
      }),
    );
  });
});
