import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import IORedis, { Cluster, ClusterOptions, Redis, RedisOptions } from 'ioredis';
import { RedisServiceIoredis } from './redis.services';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const getStr = (cs: ConfigService, key: string, fallback?: string) =>
  (cs.get<string>(key) ?? fallback) as string | undefined;

const getNum = (cs: ConfigService, key: string, fallback?: number) => {
  const v = cs.get<string | number>(key);
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Number(n) : (fallback as number | undefined);
};

function getBaseOpts(
  config: ConfigService,
  scope: 'app' | 'bull',
): Partial<RedisOptions> {
  const isBull = scope === 'bull';
  const pick = (k: string, fb?: any) =>
    isBull ? getStr(config, `redis.${k}BullMq`, fb) : getStr(config, `redis.${k}`, fb);

  return {
    db: Number(isBull ? getNum(config, 'redis.dbBullMq', 0) : getNum(config, 'redis.db', 0)),
    password: pick('password', ''),
    keyPrefix: pick('prefix', 'cache:'),
    maxRetriesPerRequest: null as any,
    enableReadyCheck: false,
    reconnectOnError: () => true,
    connectTimeout: Number(
      isBull
        ? getNum(config, 'redis.connectTimeoutBullMq', 5000)
        : getNum(config, 'redis.connectTimeout', 5000),
    ),
    retryStrategy: (times: number) => (times > 4 ? 200 : Math.min(times * 50, 200)),
  };
}

function parseClusterNodes(nodesStr?: string): { host: string; port: number }[] {
  if (!nodesStr) return [];
  return nodesStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [host, portStr] = s.split(':');
      return { host, port: Number(portStr || 6379) };
    });
}

function createStandalone(config: ConfigService, scope: 'app' | 'bull'): Redis {
  const isBull = scope === 'bull';
  const host =
    (isBull ? getStr(config, 'redis.hostBullMq') : getStr(config, 'redis.host')) ??
    getStr(config, 'redis.host', 'localhost')!;

  const port =
    (isBull ? getNum(config, 'redis.portBullMq') : getNum(config, 'redis.port')) ??
    getNum(config, 'redis.port', 6379)!;

  return new IORedis({
    host,
    port,
    ...(getBaseOpts(config, scope) as RedisOptions),
  });
}

function createCluster(config: ConfigService, scope: 'app' | 'bull'): Cluster {
  const isBull = scope === 'bull';
  const nodesStr =
    (isBull ? getStr(config, 'redis.clusterNodesBullMq') : getStr(config, 'redis.clusterNodes')) ??
    getStr(config, 'redis.clusterNodes');

  const nodes = parseClusterNodes(nodesStr);
  if (!nodes.length) {
    throw new Error(
      `${
        isBull ? 'BullMQ' : 'App'
      } redis.mode=cluster nhưng 'redis.${isBull ? 'clusterNodesBullMq' : 'clusterNodes'}' đang rỗng.`,
    );
  }

  const clusterOpts: ClusterOptions = {
    slotsRefreshTimeout: 2000,
    scaleReads: 'slave',
    redisOptions: getBaseOpts(config, scope) as RedisOptions,
  };
  return new Cluster(nodes, clusterOpts);
}

function smartCreate(config: ConfigService, scope: 'app' | 'bull'): Redis | Cluster {
  const appMode = (getStr(config, 'redis.mode', 'standalone') ?? 'standalone').toLowerCase();

  if (scope === 'app') {
    return appMode === 'cluster' ? createCluster(config, 'app') : createStandalone(config, 'app');
  }

  const bullModeRaw = (getStr(config, 'redis.modeBullMq', 'inherit') ?? 'inherit').toLowerCase();
  if (bullModeRaw === 'cluster') return createCluster(config, 'bull');
  if (bullModeRaw === 'standalone') return createStandalone(config, 'bull');

  // inherit
  return appMode === 'cluster' ? createCluster(config, 'app') : createStandalone(config, 'app');
}

@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const bullClient = smartCreate(config, 'bull');
        return {
          // BullMQ có thể nhận ioredis connection (standalone/cluster)
          connection: bullClient as any,
          defaultJobOptions: {
            attempts: 3,
            removeOnComplete: 5000,
            removeOnFail: 5000,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: 'otp' },
      { name: 'notification' },
      { name: 'claim-token' },
      { name: 'telegram' },
      { name: 'notification-firebase' },
      { name: 'claim-group-mining-token' },
    ),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => smartCreate(config, 'app'),
    },
    RedisServiceIoredis,
  ],
  exports: [REDIS_CLIENT, RedisServiceIoredis, BullModule],
})
export class RedisModule {}
