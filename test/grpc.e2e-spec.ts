import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as loader from '@grpc/proto-loader';
import { AppModule } from '../src/app.module.js';
import { grpcOptions } from '../src/ingest/contracts.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const url = '127.0.0.1:50999';

// a connector the way an external one would talk to the hub
type Callback = (
  err: grpc.ServiceError | null,
  out: Record<string, unknown>,
) => void;
type Client = Record<string, (...args: unknown[]) => unknown> & grpc.Client;

function connect(): Client {
  const definition = loader.loadSync('proto/ingest.proto', {
    keepCase: false,
    longs: Number,
  });
  const proto = grpc.loadPackageDefinition(definition) as unknown as {
    unihub: {
      ingest: {
        Ingest: new (url: string, c: grpc.ChannelCredentials) => Client;
      };
    };
  };
  return new proto.unihub.ingest.Ingest(url, grpc.credentials.createInsecure());
}

const metadata = (token: string) => {
  const md = new grpc.Metadata();
  md.set('authorization', `Bearer ${token}`);
  return md;
};

describe('gRPC ingest', () => {
  let app: INestApplication;
  let client: Client;

  const call = (
    method: string,
    request: object,
    token = 'good-test-token-0001',
  ) =>
    new Promise<Record<string, unknown>>((resolve, reject) =>
      client[method](request, metadata(token), ((err, out) =>
        err ? reject(err) : resolve(out)) as Callback),
    );

  const sendContent = (externalId: string, data: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const stream = client.Content(metadata('good-test-token-0001'), ((
        err,
        out,
      ) =>
        err
          ? reject(err)
          : resolve(out)) as Callback) as grpc.ClientWritableStream<object>;
      stream.write({ externalId });
      for (const piece of data.match(/.{1,4}/g) ?? [])
        stream.write({ data: Buffer.from(piece) });
      stream.end();
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.connectMicroservice(grpcOptions(url));
    await app.startAllMicroservices();
    await app.init();
    client = connect();
  });

  afterAll(async () => {
    client.close();
    await app.close();
  });

  it('takes what a connector sends, as the portal of its token', async () => {
    expect(await call('Course', { externalId: 'c1', name: 'AR' })).toEqual({
      changed: true,
    });
    expect(
      await call('Item', {
        externalId: 'p1',
        course: 'c1',
        kind: 'post',
        publishedAt: '2026-10-29T14:12:00Z',
        rawJson: '{"guid":"p1"}',
      }),
    ).toEqual({ changed: true });
    expect(
      await call('File', {
        externalId: 'f1',
        course: 'c1',
        name: 'l5.pdf',
        size: 12,
      }),
    ).toEqual({ changed: true, needsContent: true });
    expect(await sendContent('f1', 'slides v1 content')).toMatchObject({
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      changed: true,
    });

    const item = await app
      .get(PrismaService)
      .item.findFirstOrThrow({ where: { externalId: 'p1' } });
    expect(item.portal).toBe('grpc-test');
    expect(item.raw).toEqual({ guid: 'p1' });
  });

  it('keeps the connector state', async () => {
    expect(await call('GetState', {})).toEqual({});
    await call('SaveState', { json: '{"cursor":7}' });
    expect(await call('GetState', {})).toEqual({ json: '{"cursor":7}' });
  });

  it('answers with statuses a connector can act on', async () => {
    await expect(
      call('Course', { externalId: 'c2', name: 'x' }, 'wrong-token'),
    ).rejects.toMatchObject({ code: grpc.status.UNAUTHENTICATED });
    await expect(
      call('Item', { externalId: 'p2', kind: 'post', rawJson: 'not json' }),
    ).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });
    await expect(
      call('Item', {
        externalId: 'p3',
        course: 'nope',
        kind: 'post',
        rawJson: '{}',
      }),
    ).rejects.toMatchObject({ code: grpc.status.FAILED_PRECONDITION });
  });
});
