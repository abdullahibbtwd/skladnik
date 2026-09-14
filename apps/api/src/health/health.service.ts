import { Injectable } from '@nestjs/common';
import { APP_NAME } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';

type Check = 'ok' | 'error';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  async check() {
    const [postgres, redis, minio, ping] = await Promise.all([
      this.probe('postgres', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('redis', () => this.redis.ping()),
      this.probe('minio', () => this.storage.ping()),
      this.probe('prisma', () => this.prisma.ping.count()),
    ]);

    const checks = { postgres, redis, minio, prisma: ping };
    const status = Object.values(checks).every((value) => value === 'ok')
      ? 'ok'
      : 'degraded';

    return { status, app: APP_NAME, checks };
  }

  private async probe(name: string, fn: () => Promise<unknown>): Promise<Check> {
    try {
      await fn();
      return 'ok';
    } catch (error) {
      console.error(`[health] ${name} failed`, error);
      return 'error';
    }
  }
}
