import { Module, Global, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        const logger = new Logger('RedisModule');
        const redis = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          lazyConnect: true,
          enableOfflineQueue: true,
          maxRetriesPerRequest: 3,
          connectTimeout: 5000,
          disconnectTimeout: 2000,
          retryStrategy: (times: number) => {
            if (times > 10) {
              logger.error('Redis max connection retries reached. Continuing without Redis...');
              return null;
            }
            const delay = Math.min(times * 200, 3000);
            return delay;
          },
          reconnectOnError: (err: Error) => {
            logger.warn(`Redis reconnect on error: ${err.message}`);
            return true;
          },
        });

        redis.on('connect', () => {
          logger.log('Redis connected successfully');
        });

        redis.on('ready', () => {
          logger.log('Redis is ready');
        });

        redis.on('error', (err) => {
          logger.warn(`Redis error: ${err.message}`);
        });

        redis.on('close', () => {
          logger.warn('Redis connection closed');
        });

        redis.connect().catch((err) => {
          logger.warn(`Redis initial connection failed: ${err.message}. App will continue with offline queue.`);
        });

        return redis;
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
