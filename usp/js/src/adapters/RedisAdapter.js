import { Redis } from 'ioredis';

export class RedisAdapter {
  constructor(redisOptions = {}) {
    this.options = redisOptions;
    this.redis = null;
  }

  async init() {
    this.redis = new Redis(this.options);
    console.log('[RedisAdapter] Ready');
  }

  async set(session, key, value) {
    await this.redis.hset(`usp:${session}`, key, value);
  }

  async getSessionState(session) {
    const state = await this.redis.hgetall(`usp:${session}`);
    return state || {};
  }
}
