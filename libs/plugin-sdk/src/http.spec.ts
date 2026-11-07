import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import axios from 'axios';
import {
  guarded,
  MAX_ANSWER_BYTES,
  portalRequests,
  refusedByGuard,
} from './http.js';

// A server of the hub's own network, as a portal plugin's request would
// reach it, and what it was asked: none of it, mostly.
async function local(answer: Parameters<typeof createServer>[1]) {
  const asked: string[] = [];
  const server: Server = createServer((req, res) => {
    asked.push(req.url!);
    answer!(req, res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return { asked, port, close: () => server.close() };
}

// names as a made-up DNS has them: one public, one inside
const NAMES: Record<string, string> = {
  'canvas.example.edu': '127.0.0.1',
  'files.example.edu': '10.0.0.7',
};
const lookup = async (hostname: string) => ({
  address: NAMES[hostname],
  family: 4 as const,
});

const refusal = (request: Promise<unknown>) =>
  request.then(
    () => expect.unreachable('the request went through'),
    (error: Error) => error.message,
  );

describe('portal requests', () => {
  const servers: { close(): void }[] = [];
  afterEach(() => {
    servers.splice(0).forEach((s) => s.close());
    vi.unstubAllEnvs();
  });
  const serve = async (answer: Parameters<typeof local>[0]) => {
    const server = await local(answer);
    servers.push(server);
    return server;
  };
  const ok = serve.bind(null, (_req, res) => res.end('{}'));

  it("refuse an address inside, whether it's typed or looked up", async () => {
    const { asked, port } = await ok();
    const http = axios.create(portalRequests);

    for (const url of [
      `http://127.0.0.1:${port}/api/v1/users/self`,
      `http://localhost:${port}/api/v1/users/self`,
      `http://[::1]:${port}/`,
      'http://169.254.169.254/latest/meta-data/',
    ])
      expect(await refusal(http.get(url))).toMatch(/is not allowed/);
    // a name that looks up inside this time, though it didn't before
    expect(
      await refusal(http.get(`http://files.example.edu:${port}/`, { lookup })),
    ).toMatch(/10\.0\.0\.7.*is not allowed/);
    expect(asked).toEqual([]);
  });

  it('tell a refusal from the network failing', async () => {
    const failed = (request: Promise<unknown>) =>
      request.then(
        () => expect.unreachable(),
        (error: unknown) => error,
      );
    const { port, close } = await ok();
    close();

    expect(
      refusedByGuard(
        await failed(
          axios.create(portalRequests).get(`http://10.0.0.7:${port}/`),
        ),
      ),
    ).toBe(true);
    expect(
      refusedByGuard(
        await failed(
          axios
            .create(guarded({ allowIPAddressList: ['127.0.0.1'] }))
            .get(`http://127.0.0.1:${port}/`),
        ),
      ),
    ).toBe(false);
    expect(refusedByGuard('is not allowed')).toBe(false);
  });

  it('check every hop: a redirect inside is refused, by address or by name', async () => {
    // let the portal stand in on loopback; everything else stays refused
    const http = axios.create(guarded({ allowIPAddressList: ['127.0.0.1'] }));
    const portal = await serve((req, res) => {
      const to = req.url === '/by-name' ? 'http://files.example.edu/x' : null;
      res.writeHead(302, {
        location: to ?? 'http://169.254.169.254/latest/meta-data/',
      });
      res.end();
    });
    const base = `http://canvas.example.edu:${portal.port}`;

    expect(await refusal(http.get(`${base}/by-address`, { lookup }))).toMatch(
      /169\.254\.169\.254.*is not allowed/,
    );
    expect(await refusal(http.get(`${base}/by-name`, { lookup }))).toMatch(
      /10\.0\.0\.7.*is not allowed/,
    );
    expect(portal.asked).toEqual(['/by-address', '/by-name']);
  });

  it('cap an answer, streamed or not, and go by no proxy', async () => {
    const portal = await serve((_req, res) =>
      Readable.from(
        (function* () {
          const chunk = Buffer.alloc(1024 * 1024, 0x20);
          for (let sent = 0; sent <= MAX_ANSWER_BYTES; sent += chunk.length)
            yield chunk;
        })(),
      ).pipe(res),
    );
    // a proxy would be asked to connect in the agents' place
    vi.stubEnv('HTTP_PROXY', 'http://169.254.169.254:3128');
    const http = axios.create(guarded({ allowIPAddressList: ['127.0.0.1'] }));
    const url = `http://127.0.0.1:${portal.port}/big`;

    expect(await refusal(http.get(url))).toMatch(/maxContentLength/);
    const { data } = await http.get<Readable>(url, { responseType: 'stream' });
    expect(await refusal(data.toArray())).toMatch(/maxContentLength/);
    expect(portalRequests).toMatchObject({ proxy: false, maxRedirects: 5 });
  });
});
