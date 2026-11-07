import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { auth, server, signedIn } from './server';

const api = (path: string) => `http://localhost:3000/api${path}`;

describe('states', () => {
  it('shows a retry on a list that failed, and loads it again', async () => {
    signedIn();
    let failing = true;
    server.use(
      http.get(api('/courses'), () =>
        failing
          ? HttpResponse.json({ statusCode: 500 }, { status: 500 })
          : HttpResponse.json([
              {
                slug: 'os',
                name: 'Operating systems',
                sources: [],
                portalCourses: [],
              },
            ]),
      ),
      http.get(api('/me/portals'), () => HttpResponse.json([])),
    );
    renderApp('/');

    // a failure is tried twice more before it is shown
    expect(
      await screen.findByText("Couldn't load this", {}, { timeout: 5000 }),
    ).toBeVisible();
    expect(
      screen.getByText(/Something went wrong on UniHub's side/),
    ).toBeVisible();
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Operating systems')).toBeVisible();
    expect(screen.queryByText("Couldn't load this")).toBeNull();
  });

  it('says there are no keys yet, and what to name one', async () => {
    signedIn();
    server.use(
      http.get(auth('/api-key/list'), () =>
        HttpResponse.json({ apiKeys: [], total: 0 }),
      ),
    );
    renderApp('/connect');

    expect(await screen.findByText('No keys yet')).toBeVisible();
    expect(
      screen.getByText(/Name one after the app or computer it's for/),
    ).toBeVisible();
  });

  it('says offline when the network fails', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () => HttpResponse.error()),
      http.get(api('/me/portals'), () => HttpResponse.json([])),
    );
    renderApp('/');

    expect(
      await screen.findByText(/You seem to be offline/, {}, { timeout: 5000 }),
    ).toBeVisible();
  });

  it('says a course is not found', async () => {
    signedIn();
    server.use(
      http.get(api('/courses'), () => HttpResponse.json([])),
      http.get(api('/me/portals'), () => HttpResponse.json([])),
    );
    renderApp('/courses/gone');

    expect(
      await screen.findByRole('heading', { name: 'Course not found' }),
    ).toBeVisible();
    expect(screen.getByText(/It may have been removed/)).toBeVisible();
  });
});
