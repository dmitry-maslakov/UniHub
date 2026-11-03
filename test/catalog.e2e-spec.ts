import { Test } from '@nestjs/testing';
import { CommandBus } from '@nestjs/cqrs';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UpsertPortalCourseCommand } from '../src/catalog/application/commands/upsert-portal-course.command.js';
import { UpsertItemCommand } from '../src/catalog/application/commands/upsert-item.command.js';
import { UpsertFileCommand } from '../src/catalog/application/commands/upsert-file.command.js';
import { FileRepository } from '../src/catalog/domain/file.js';

describe('catalog', () => {
  let commands: CommandBus;
  let prisma: PrismaService;
  let files: FileRepository;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await app.init();
    commands = app.get(CommandBus);
    prisma = app.get(PrismaService);
    files = app.get(FileRepository);
    close = () => app.close();

    await prisma.file.deleteMany();
    await prisma.item.deleteMany();
    await prisma.portalCourse.deleteMany();
  });

  afterAll(() => close());

  it('writes a portal course only when it changes', async () => {
    const course = { portal: 'test', externalId: 'ar', name: 'AR' };

    const first = await commands.execute(new UpsertPortalCourseCommand(course));
    const again = await commands.execute(new UpsertPortalCourseCommand(course));
    const renamed = await commands.execute(
      new UpsertPortalCourseCommand({ ...course, name: 'AR SIIT' }),
    );

    expect(first.changed).toBe(true);
    expect(again).toEqual({ entity: first.entity, changed: false });
    expect(renamed.changed).toBe(true);
    expect(renamed.entity.id).toBe(first.entity.id);
  });

  it('treats json with reordered keys as the same item', async () => {
    const item = {
      portal: 'test',
      externalId: 'post-1',
      kind: 'post',
      raw: { guid: 'post-1', title: 'Exam' },
    };

    await commands.execute(new UpsertItemCommand(item));
    const again = await commands.execute(
      new UpsertItemCommand({
        ...item,
        raw: { title: 'Exam', guid: 'post-1' },
      }),
    );

    expect(again.changed).toBe(false);
  });

  it('keeps the content hash when the portal resends a file', async () => {
    const file = {
      portal: 'test',
      externalId: 'file-1',
      name: 'lecture-5.pdf',
      size: 3124756,
    };

    const { entity } = await commands.execute(new UpsertFileCommand(file));
    await files.setContentHash(entity.id, 'abc');
    const again = await commands.execute(new UpsertFileCommand(file));

    expect(again.changed).toBe(false);
    expect(again.entity.contentHash).toBe('abc');
  });
});
