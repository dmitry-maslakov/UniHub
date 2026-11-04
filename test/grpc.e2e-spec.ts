import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as loader from '@grpc/proto-loader';
import { getProtoPath, loadSync } from 'google-proto-files';
import { AppModule } from '../src/app.module.js';
import { grpcOptions } from '../src/ingest/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { testEnv } from './env.js';

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

// why a call failed, from the standard status details: google.rpc.Status
// with an ErrorInfo, decoded with Google's own protos
const rpc = loadSync(getProtoPath('rpc', 'status.proto'));
rpc.loadSync(getProtoPath('rpc', 'error_details.proto'));
const Status = rpc.lookupType('google.rpc.Status');
const reasonOf = async (call: Promise<unknown>) => {
  const error = (await call.catch((e: unknown) => e)) as grpc.ServiceError;
  const [bytes] = error.metadata.get('grpc-status-details-bin');
  const status = Status.toObject(Status.decode(bytes as Buffer), {
    json: true,
  });
  return { code: error.code, status };
};

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

  it('takes json as postgres keeps it, so a resend changes nothing', async () => {
    for (const [externalId, rawJson] of [
      ['p-minus-zero', '{"score":-0}'],
      ['p-null', 'null'],
    ]) {
      const item = { externalId, kind: 'post', rawJson };
      expect(await call('Item', item)).toEqual({ changed: true });
      expect(await call('Item', item)).toEqual({ changed: false });
    }
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

  it('refuses content past STORAGE_MAX_FILE_MB and keeps none of it', async () => {
    // a size past it: not asked for, or the connector would send it on every sync
    expect(
      await call('File', {
        externalId: 'f7',
        course: 'c1',
        name: 'recording.mp4',
        size: 3 * 1024 * 1024,
      }),
    ).toEqual({ changed: true, needsContent: false });
    // no size: asked for, and refused when it comes
    expect(
      await call('File', { externalId: 'f6', course: 'c1', name: 'talk.mp4' }),
    ).toEqual({ changed: true, needsContent: true });
    const stored = async () =>
      (await readdir(testEnv.STORAGE_PATH, { recursive: true })).length;
    const before = await stored();

    await expect(
      sendContent('f6', Buffer.alloc(3 * 1024 * 1024, 'video ')),
    ).rejects.toMatchObject({ code: grpc.status.INVALID_ARGUMENT });

    expect((await file('f6')).contentHash).toBeNull();
    expect(await stored()).toBe(before);
  });

  it('keeps the connector state', async () => {
    expect(await call('GetState', {})).toEqual({});
    await call('SaveState', { json: '{"cursor":7}' });
    expect(await call('GetState', {})).toEqual({ json: '{"cursor":7}' });
    await expect(call('SaveState', {})).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });
    // null is a state too: as if none was ever saved
    expect(await call('SaveState', { json: 'null' })).toEqual({});
    expect(await call('GetState', {})).toEqual({});
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
    // a post's file that names another course than the post's
    await call('Course', { externalId: 'c3', name: 'other' });
    expect(
      await reasonOf(
        call('File', { externalId: 'f5', course: 'c3', item: 'p1', name: 'a' }),
      ),
    ).toEqual({
      code: grpc.status.INVALID_ARGUMENT,
      status: {
        code: grpc.status.INVALID_ARGUMENT,
        message: expect.stringContaining("isn't in course c3"),
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'FILE_COURSE_MISMATCH',
            domain: 'unihub',
          },
        ],
      },
    });
    expect(
      (await reasonOf(sendContent('nope', Buffer.from('bytes')))).status,
    ).toMatchObject({ details: [{ reason: 'UNKNOWN_REFERENCE' }] });

    // the client stream is guarded too
    const { stream, answer } = openContent('wrong-token');
    stream.write({ externalId: 'f1' });
    stream.end();
    await expect(answer).rejects.toMatchObject({
      code: grpc.status.UNAUTHENTICATED,
    });
  });
});
