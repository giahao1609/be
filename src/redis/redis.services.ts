import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import objectHash from 'object-hash';
import type { Redis as RedisClient, Cluster } from 'ioredis';
import LRUCache from 'lru-cache';
function dateTimeReviver(key: string, value: any) {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return new Date(value);
  }
  return value;
}

@Injectable()
export class RedisServiceIoredis {
  private readonly DEFAULT_TTL = 60 * 60 * 24 * 3;
  private readonly OTP_TTL = 300;
  private readonly TELEGRAM_TTL = 300;
  private readonly DEFAULT_MEM_TTL_MS = 60_000;
  private readonly memoryCache: LRUCache<string, string>;
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: RedisClient | Cluster,
    @InjectQueue('otp') private readonly otpQueue: Queue,
  ) {
    this.memoryCache = new LRUCache({
      max: 100,
      ttl: 60 * 1000,
    });
  }


  // Generic cache helpers

  hash(data: any): string {
    return this.sha(data);
  }

  generatePrefixFunctionName(functionName: string): string {
    return `${functionName}`;
  }

  async get(functionName: string, queryList: any[]): Promise<any | null> {
    const prefix = this.generatePrefixFunctionName(functionName);
    const key = this.sha(queryList);
    const theKey = `${prefix}-${key}`;
    return this.redisGet(theKey);
  }

  async set(
    functionName: string,
    queryList: any[],
    data: any,
    ttl?: number,
  ): Promise<void> {
    const prefix = this.generatePrefixFunctionName(functionName);
    const key = this.sha(queryList);
    const theKey = `${prefix}-${key}`;
    try {
      const ttlSec =
        Number.isInteger(ttl) && (ttl as number) > 0
          ? (ttl as number)
          : undefined;
      await this.redisSet(theKey, data, ttlSec);
    } catch (error) {
      console.error(
        `Failed to set cache for key ${theKey}, invalidating...`,
        error,
      );
      await this.invalidate(functionName, queryList);
    }
  }

  async invalidateFunctionName(functionName: string): Promise<void> {
    await this.invalidateFunctionPrefix(
      this.generatePrefixFunctionName(functionName),
    );
  }

  async invalidateFunctionPrefix(prefix: string): Promise<void> {
    const keys = await this.scanKeysByPrefix(prefix, 1000);
    if (!keys.length) return;

    const batch: string[] = [];
    for (const k of keys) {
      batch.push(k);
      if (batch.length >= 500) {
        await this.redisDel(batch.splice(0, 500));
      }
    }
    if (batch.length) {
      await this.redisDel(batch);
    }
  }

  async invalidate(functionName: string, queryList: any[]): Promise<void> {
    const prefix = this.generatePrefixFunctionName(functionName);
    const key = this.sha(queryList);
    const theKey = `${prefix}-${key}`;
    await this.redisDel(theKey);
  }




   private sha(data: any) {
    return objectHash.sha1(data);
  }

  private async redisGet<T = any>(key: string): Promise<T | null> {
    const str = await (this.redis as any).get(key);
    if (!str) return null;
    try {
      return JSON.parse(str, dateTimeReviver) as T;
    } catch {
      return str as unknown as T;
    }
  }


  private async redisSet(
    key: string,
    value: any,
    ttlSeconds?: number,
  ): Promise<'OK' | null> {
    const str = typeof value === 'string' ? value : JSON.stringify(value);

    const expire = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : this.DEFAULT_TTL;

    return (this.redis as any).set(key, str, 'EX', expire);
  }

  private async redisDel(key: string | string[]) {
    if (Array.isArray(key)) {
      if (key.length === 0) return 0;
      return (this.redis as any).del(...key);
    }
    return (this.redis as any).del(key);
  }

  private parseMemory<T = unknown>(raw: string): T | string {
    try {
      return JSON.parse(raw, dateTimeReviver) as T;
    } catch {
      return raw;
    }
  }

  private isCluster(): boolean {
    return typeof (this.redis as any).nodes === 'function';
  }

  private async scanKeysByPrefix(
    prefix: string,
    count = 1000,
  ): Promise<string[]> {
    const pattern = `${prefix}*`;

    // Standalone
    if (!this.isCluster()) {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [next, batch] = await (this.redis as RedisClient).scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          count,
        );
        cursor = next;
        if (batch?.length) keys.push(...batch);
      } while (cursor !== '0');
      return keys;
    }

    // Cluster
    const cluster = this.redis as Cluster;
    const masters = cluster.nodes('master');
    const set = new Set<string>();

    for (const node of masters) {
      let cursor = '0';
      do {
        const [next, batch] = await node.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          count,
        );
        cursor = next;
        if (batch?.length) batch.forEach((k) => set.add(k));
      } while (cursor !== '0');
    }
    return Array.from(set);
  }



    // get cache menory before get cache redis

  async getCachedMenoryFirst(
    namespace: string,
    keyShard: any,
    functionName: string,
    queryList: any[],
    memTtlMs: number = this.DEFAULT_MEM_TTL_MS,
  ): Promise<any | null> {
    const key = this.sha(queryList);
    const theKey = `${namespace}:{${keyShard}}:${functionName}:${key}`;

    const raw = this.memoryCache.get(theKey);
    if (raw !== undefined) {
      return this.parseMemory(raw);
    }

    const fromRedis = await this.redisGet<any>(theKey);
    if (fromRedis !== null && fromRedis !== undefined) {
      const serialized =
        typeof fromRedis === 'string' ? fromRedis : JSON.stringify(fromRedis);
      this.memoryCache.set(theKey, serialized, { ttl: memTtlMs });
    }
    return fromRedis ?? null;
  }

  async setCachedMenoryFirst(
    namespace: string,
    keyShard: any,
    functionName: string,
    queryList: any[],
    data: any,
    ttlSec?: number,
  ): Promise<void> {
    const key = this.sha(queryList);
    const theKey = `${namespace}:{${keyShard}}:${functionName}:${key}`;

    const memTtlMs =
      Number.isInteger(ttlSec) && (ttlSec as number) > 0
        ? (ttlSec as number) * 1000
        : this.DEFAULT_MEM_TTL_MS;

    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    this.memoryCache.set(theKey, serialized, { ttl: memTtlMs });

    const ttl =
      Number.isInteger(ttlSec) && (ttlSec as number) > 0
        ? (ttlSec as number)
        : undefined;
    try {
      await this.redisSet(theKey, data, ttl);
    } catch (error) {
      this.memoryCache.delete(theKey);
      console.error(
        `Failed to set cache for key ${theKey}, invalidating...`,
        error,
      );
      await this.invalidateCachedMenory(namespace, keyShard, functionName, queryList);
    }
  }

  async invalidateCachedMenoryByFunctionName(namespace: string, keyShard: string, functionName: string): Promise<void> {
    const theKey = `${namespace}:{${keyShard}}:${functionName}`;
    await this.invalidateCachedMenoryByPrefix(theKey);
  }

  async invalidateCachedMenoryByPrefix(prefix: string): Promise<void> {
    for (const k of this.memoryCache.keys()) {
      if (k.startsWith(prefix)) {
        this.memoryCache.delete(k);
      }
    }

    const keys = await this.scanKeysByPrefix(prefix, 1000);
    if (!keys.length) return;

    const batch: string[] = [];
    for (const k of keys) {
      batch.push(k);
      if (batch.length >= 500) {
        await this.redisDel(batch.splice(0, 500));
      }
    }
    if (batch.length) {
      await this.redisDel(batch);
    }
  }

  async invalidateCachedMenory(
    namespace: string,
    keyShard: any,
    functionName: string,
    queryList: any[],
  ): Promise<void> {
    const key = this.sha(queryList);
    const theKey = `${namespace}:{${keyShard}}:${functionName}:${key}`;

    this.memoryCache.delete(theKey);
    await this.redisDel(theKey);
  }

  //redis user
  async getCacheNameSpace(namespace: string, keyShard: string, functionName: string, queryList: any[]): Promise<any | null> {
    const key = this.sha(queryList);
    const theKey = `${namespace}:{${keyShard}}:${functionName}:${key}`;
    // console.log('theKey', theKey);
    return this.redisGet(theKey);
  }

  async setCacheNameSpace(namespace: string, keyShard: string, functionName: string, queryList: any[], data: any, ttl?: number): Promise<void> {
    const key = this.sha(queryList);
    const theKey = `${namespace}:{${keyShard}}:${functionName}:${key}`;
    // console.log('theKey', theKey);
    try {
      const ttlSec = Number.isInteger(ttl) && (ttl as number) > 0 ? (ttl as number) : undefined;
      await this.redisSet(theKey, data, ttlSec);
    } catch (error) {
      console.error(`Failed to set cache for key ${theKey}, invalidating...`, error);
      await this.invalidate(functionName, queryList);
    }
  }

  async invalidateFunctionNameSpace(namespace: string, keyShard: string, functionName: string,): Promise<void> {
    const theKey = `${namespace}:{${keyShard}}:${functionName}`;
    await this.invalidateFunctionPrefix(theKey);
  }


  async invalidateCacheNameSpace(namespace: string, keyShard, functionName: string, queryList: any[]): Promise<void> {
    const key = this.sha(queryList);
    const theKey = `${namespace}:{${keyShard}}:${functionName}:${key}`;
    await this.redisDel(theKey);
  }

}
