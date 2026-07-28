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

  async set(session, key, value, hlc) {
    const existingStr = await this.redis.hget(`usp:${session}`, key);
    if (existingStr) {
      try {
        const existing = JSON.parse(existingStr);
        if (existing && existing.hlc && hlc && existing.hlc > hlc) {
          return false; // Rejected
        }
      } catch (e) {
        // ignore parsing errors
      }
    }
    await this.redis.hset(`usp:${session}`, key, JSON.stringify({ value, hlc }));
    return true;
  }

  async getSessionState(session) {
    const stateStr = await this.redis.hgetall(`usp:${session}`);
    if (!stateStr) return {};
    
    const state = {};
    for (const key in stateStr) {
      try {
        state[key] = JSON.parse(stateStr[key]);
      } catch (e) {
        state[key] = { value: stateStr[key], hlc: null };
      }
    }
    return state;
  }
}
