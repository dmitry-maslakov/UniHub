import { Controller, Get, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { ADMIN_ROLE, Roles } from '../../identity/contracts.js';
import { MODELS_QUEUE } from './models.queue.js';
import { PLUGINS_QUEUE } from './plugins.queue.js';
import { SEARCH_INDEX_QUEUE } from './search/search-index.queue.js';

export class QueueStatusResponse {
  @ApiProperty({ example: 'plugins' }) name!: string;
  @ApiProperty() waiting!: number;
  @ApiProperty() active!: number;
  @ApiProperty() failed!: number;
}

// what a queue has to do now, from BullMQ's atomic counts
async function statusOf(queue: Pick<Queue, 'name' | 'getJobCounts'>) {
  const { waiting, active, failed } = await queue.getJobCounts(
    'waiting',
    'active',
    'failed',
  );
  return { name: queue.name, waiting, active, failed };
}

// For the hub's owner: how the background processing stands
@ApiTags('admin')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'for admins only' })
@Roles([ADMIN_ROLE])
@Controller('admin/queues')
export class QueuesController {
  constructor(
    @InjectQueue(PLUGINS_QUEUE) private readonly plugins: Queue,
    @InjectQueue(MODELS_QUEUE) private readonly models: Queue,
    // none when search is off
    @Optional()
    @InjectQueue(SEARCH_INDEX_QUEUE)
    private readonly searchIndex?: Queue,
  ) {}

  @Get()
  @ApiOkResponse({
    type: [QueueStatusResponse],
    description: 'the plugins, models and search index queues',
  })
  async list(): Promise<QueueStatusResponse[]> {
    return Promise.all(
      [this.plugins, this.models, this.searchIndex]
        .filter((queue) => queue !== undefined)
        .map(statusOf),
    );
  }
}
