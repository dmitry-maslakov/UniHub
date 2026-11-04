import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as loader from '@grpc/proto-loader';
import { AppModule } from '../src/app.module.js';
import { grpcOptions } from '../src/ingest/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';

const url = '127.0.0.1:50999';
const TOKEN = 'good-test-token-0001';
const PORTAL = 'grpc-test';

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
        v1: {
          Ingest: new (url: string, c: grpc.ChannelCredentials) => Client;
        };
      };
    };
  };
  return new proto.unihub.ingest.v1.Ingest(
    url,
    grpc.credentials.createInsecure(),
  );
}

const metadata = (token: string) => {
  const md = new grpc.Metadata();
  md.set('authorization', `Bearer ${token}`);
  return md;
};

const sha256 = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');

describe('gRPC ingest', () => {
  let app: INestApplication;
  let client: Client;
  let prisma: PrismaService;

  const call = (method: string, request: object, token = TOKEN) =>
    new Promise<Record<string, unknown>>((resolve, reject) =>
      client[method](request, metadata(token), ((err, out) =>
        err ? reject(err) : resolve(out)) as Callback),
    );

  // opens Content and hands back the stream and its answer
  const openContent = (token = TOKEN) => {
    let stream!: grpc.ClientWritableStream<object>;
    const answer = new Promise<Record<string, unknown>>((resolve, reject) => {
      stream = client.Content(metadata(token), ((err, out) =>
        err ? reject(err) : resolve(out)) as Callback) as typeof stream;
    });
    return { stream, answer };
  };

  // the content in 64 KB pieces, then its hash
  const sendContent = (
    externalId: string,
    data: Buffer,
    hash = sha256(data),
  ) => {
    const { stream, answer } = openContent();
    stream.write({ externalId });
    for (let at = 0; at < data.length; at += 65_536)
      stream.write({ data: data.subarray(at, at + 65_536) });
    stream.write({ sha256: hash });
    stream.end();
    return answer;
  };

  const file = (externalId: string) =>
    prisma.file.findUniqueOrThrow({
      where: { portal_externalId: { portal: PORTAL, externalId } },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.connectMicroservice(grpcOptions(url));
    await app.startAllMicroservices();
    await app.init();
    prisma = app.get(PrismaService);
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
        publishedAt: {
          seconds: Date.parse('2026-10-29T14:12:00Z') / 1000,
          nanos: 500_000_000,
        },
        rawJson: '{"guid":"p1"}',
      }),
    ).toEqual({ changed: true });
    expect(
      await call('File', {
        externalId: 'f1',
        course: 'c1',
        name: 'l5.pdf',
        size: 1_000_000,
      }),
    ).toEqual({ changed: true, needsContent: true });

    // several pieces, so flow control has something to do
    const content = Buffer.alloc(1_000_000, 'slides v1 ');
    expect(await sendContent('f1', content)).toEqual({
      hash: sha256(content),
      changed: true,
    });

    const item = await prisma.item.findUniqueOrThrow({
      where: { portal_externalId: { portal: PORTAL, externalId: 'p1' } },
    });
    expect(item.raw).toEqual({ guid: 'p1' });
    expect(item.publishedAt).toEqual(new Date('2026-10-29T14:12:00.500Z'));
    expect((await file('f1')).contentHash).toBe(sha256(content));

    expect(await call('RemoveFile', { externalId: 'f1' })).toEqual({
      changed: true,
    });
    expect((await file('f1')).removedAt).not.toBeNull();
  });

  it('stores nothing from an upload that was cut off', async () => {
    await call('File', { externalId: 'f2', course: 'c1', name: 'l6.pdf' });

    const { stream, answer } = openContent();
    stream.write({ externalId: 'f2' });
    stream.write({ data: Buffer.from('first half ') });
    await sleep(100);
    stream.cancel();
    await expect(answer).rejects.toMatchObject({
      code: grpc.status.CANCELLED,
    });
    await sleep(300);

    expect((await file('f2')).contentHash).toBeNull();
    expect(
      await call('File', { externalId: 'f2', course: 'c1', name: 'l6.pdf' }),
    ).toMatchObject({ needsContent: true });
  });

  it('stores nothing that does not match its hash', async () => {
    await call('File', { externalId: 'f3', course: 'c1', name: 'l7.pdf' });

    await expect(
      sendContent('f3', Buffer.from('bytes'), sha256(Buffer.from('other'))),
    ).rejects.toMatchObject({ code: grpc.status.DATA_LOSS });

    const { stream, answer } = openContent();
    stream.write({ externalId: 'f3' });
    stream.write({ data: Buffer.from('no hash') });
    stream.end();
    await expect(answer).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });

    expect((await file('f3')).contentHash).toBeNull();
  });

  it('keeps the connector state', async () => {
    expect(await call('GetState', {})).toEqual({});
    await call('SaveState', { json: '{"cursor":7}' });
    expect(await call('GetState', {})).toEqual({ json: '{"cursor":7}' });
    await expect(call('SaveState', {})).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });
  });

  it('answers with statuses a connector can act on', async () => {
    await expect(
      call('Course', { externalId: 'c2', name: 'x' }, 'wrong-token'),
    ).rejects.toMatchObject({ code: grpc.status.UNAUTHENTICATED });
    await expect(
      call('Item', { externalId: 'p2', kind: 'post', rawJson: 'not json' }),
    ).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });
    await expect(
      call('File', { externalId: 'f4', name: 'a.pdf', path: 'a\u0000b' }),
    ).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });
    await expect(
      call('Item', {
        externalId: 'p3',
        course: 'nope',
        kind: 'post',
        rawJson: '{}',
      }),
    ).rejects.toMatchObject({ code: grpc.status.FAILED_PRECONDITION });
    await expect(
      sendContent('nope', Buffer.from('bytes')),
    ).rejects.toMatchObject({ code: grpc.status.FAILED_PRECONDITION });

    // the client stream is guarded too
    const { stream, answer } = openContent('wrong-token');
    stream.write({ externalId: 'f1' });
    stream.end();
    await expect(answer).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED,
    });
  });
});
