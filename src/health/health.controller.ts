import { Controller, Get, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { AllowAnonymous } from '../identity/contracts.js';
import type { Redis } from 'ioredis';
import { PrismaService } from '../platform/database/prisma.service.js';
import { REDIS } from '../platform/redis/redis.module.js';

// /api/health: up when the database and redis answer; for the container's
// health check (caddy doesn't let it out: a failure names internal hosts)
@Controller('health')
@ApiExcludeController()
@AllowAnonymous()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma),
      // the connection's state: a command would wait in ioredis's offline
      // queue for as long as redis is away
      () => {
        const redis = this.indicators.check('redis');
        return this.redis.status === 'ready' ? redis.up() : redis.down();
      },
    ]);
  }
}
