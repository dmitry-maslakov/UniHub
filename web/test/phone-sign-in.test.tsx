import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './render';
import { auth, refused, server, session } from './server';

const code = {
  device_code: 'dev-1',
  user_code: 'ABCD2345',
  verification_uri: 'https://uni.test/device',
  verification_uri_complete: 'https://uni.test/device?user_code=ABCD2345',
  expires_in: 1800,
  interval: 1,
};

const token = {
  access_token: 't',
  token_type: 'Bearer',
  expires_in: 604800,
  scope: '',
};

// the code, and a token that answers each poll with the next of `answers`
// (the last one for every poll after); `polls` collects when they came
function phone(answers: (string | 'approved')[], polls: number[] = []) {
  let signedIn = false;
  server.use(
    http.get(auth('/get-session'), () =>
      HttpResponse.json(signedIn ? session : null),
    ),
    http.post(auth('/device/code'), async ({ request }) => {
      expect(await request.json()).toEqual({ client_id: 'unihub-web' });
      return HttpResponse.json(code);
    }),
    http.post(auth('/device/token'), async ({ request }) => {
      expect(await request.json()).toEqual({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'dev-1',
        client_id: 'unihub-web',
      });
      polls.push(Date.now());
      const answer = answers[Math.min(polls.length, answers.length) - 1];
      if (answer !== 'approved') return refused(400, answer);
      signedIn = true;
      return HttpResponse.json(token);
    }),
  );
  return polls;
}

// the clock runs by itself, and a test can move it on
const later = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

// the clock moves on until the token has been asked for the n-th time
const polled = (polls: number[], n: number) =>
  vi.waitFor(
    async () => {
      await later(250);
      expect(polls).toHaveLength(n);
    },
    { timeout: 5000 },
  );

describe('signing in with a phone', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("is offered on the sign-in page, and not to an AI app's sign-in", async () => {
    renderApp('/sign-in?next=/connect');
    const link = await screen.findByRole('link', {
      name: 'Sign in with your phone',
    });
    expect(link.getAttribute('href')).toBe('/sign-in/phone?next=%2Fconnect');

    const query = '?client_id=app&ba_param=client_id&sig=a1';
    renderApp(`/sign-in${query}`);
    await screen.findAllByLabelText('Email');
    expect(
      screen.getAllByRole('link', { name: 'Sign in with your phone' }),
    ).toHaveLength(1);
  });

  it('shows a QR code of the address to approve at, and the code to type', async () => {
    phone(['authorization_pending']);
    renderApp('/sign-in/phone');
    const container = document.body;

    expect(await screen.findByText('ABCD-2345')).toBeVisible();
    expect(
      screen.getByRole('img', {
        name: 'QR code to approve this sign-in on your phone',
      }),
    ).toBeInTheDocument();
    // inline paths: no image, nothing to load from a data: address
    expect(container.querySelector('svg path')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[src^="data:"]')).toBeNull();
    expect(screen.getByText(/open uni.test\/device and enter/)).toBeVisible();
    expect(screen.getByText(/The code works for 30 minutes/)).toBeVisible();
  });

  it('polls until the phone approves, then goes on to where it was asked', async () => {
    const polls = phone([
      'authorization_pending',
      'authorization_pending',
      'approved',
    ]);
    const { router } = renderApp('/sign-in/phone?next=/connect');
    await screen.findByText('ABCD-2345');

    // the first poll comes one interval after the code
    expect(polls).toHaveLength(0);
    await polled(polls, 1);
    await polled(polls, 2);
    await polled(polls, 3);

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Connect AI' },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/connect');
  });

  it('slows down when told to', async () => {
    const polls = phone(['slow_down', 'authorization_pending']);
    renderApp('/sign-in/phone');
    await screen.findByText('ABCD-2345');

    await polled(polls, 1);
    // 1 s and 5 s more
    for (let i = 0; i < 20; i += 1) await later(250);
    expect(polls).toHaveLength(1);
    await polled(polls, 2);
  });

  it('offers a new code once the code expires', async () => {
    phone(['expired_token']);
    renderApp('/sign-in/phone');

    expect(
      await screen.findByText('This code has expired.', {}, { timeout: 4000 }),
    ).toBeVisible();
    expect(screen.queryByText('ABCD-2345')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Get a new code' }),
    );
    expect(await screen.findByText('ABCD-2345')).toBeVisible();
  });

  it('says when the phone denied it', async () => {
    phone(['access_denied']);
    renderApp('/sign-in/phone');

    expect(
      await screen.findByRole('alert', {}, { timeout: 4000 }),
    ).toHaveTextContent('The sign-in was denied on the phone.');
    expect(
      screen.getByRole('button', { name: 'Get a new code' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Sign in with email instead' }),
    ).toBeVisible();
  });
});
