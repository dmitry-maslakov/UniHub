import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const user = {
  id: 'u1',
  name: 'Ana Student',
  email: 'ana@uni.test',
  emailVerified: true,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

export const session = {
  user,
  session: {
    id: 's1',
    userId: 'u1',
    token: 't',
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
    expiresAt: '2026-11-13T10:00:00.000Z',
  },
};

export const auth = (path: string) => `http://localhost:3000/api/auth${path}`;

// Better Auth's way of refusing: a status and a code
export const refused = (status: number, code: string, message = code) =>
  HttpResponse.json({ code, message }, { status });

// signed out, with no Google, unless a test says otherwise
export const server = setupServer(
  http.get(auth('/get-session'), () => HttpResponse.json(null)),
  http.get('http://localhost:3000/api/sign-in-methods', () =>
    HttpResponse.json({ google: false }),
  ),
);

export const signedIn = () =>
  server.use(http.get(auth('/get-session'), () => HttpResponse.json(session)));

// the same user, an admin
export const signedInAsAdmin = () =>
  server.use(
    http.get(auth('/get-session'), () =>
      HttpResponse.json({ ...session, user: { ...user, role: 'admin' } }),
    ),
  );
