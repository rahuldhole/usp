import { Redis } from 'ioredis';

export class RedisAdapter {
  storeClient: any;
  subClient: any;
  pubClient: any;
  mutationCallbacks: Set<any>;

  constructor(redisOptions: any = {}) {
    this.storeClient = new Redis(redisOptions);
    this.subClient = new Redis(redisOptions);
    this.pubClient = new Redis(redisOptions);
    
    this.mutationCallbacks = new Set();
    
    // Subscribe to USP mutations channel
    this.subClient.subscribe('usp:mutations', (err) => {
      if (err) console.error("RedisAdapter subscribe error:", err);
    });
    
    this.subClient.on('message', (channel, message) => {
      if (channel === 'usp:mutations') {
        try {
          const mutation = JSON.parse(message);
          for (const cb of this.mutationCallbacks) {
            cb(mutation);
          }
        } catch (e) {
          console.error("RedisAdapter parsing mutation error:", e);
        }
      }
    });
  }

  onMutation(cb: any) {
    this.mutationCallbacks.add(cb);
    return () => this.mutationCallbacks.delete(cb);
  }

  async get(session: string, key: string) {
    const storeKey = `usp:${session}`;
    const raw = await this.storeClient.hget(storeKey, key);
    if (!raw) return undefined;
    
    const entry = JSON.parse(raw);
    if (entry.deleted) return undefined;
    return entry;
  }

  async set(session: string, key: string, val: any, hlc: string) {
    const storeKey = `usp:${session}`;
    
    // Check existing HLC to prevent out-of-order
    const existingRaw = await this.storeClient.hget(storeKey, key);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw);
      if (existing.hlc && hlc && hlc < existing.hlc) {
        return false; // Outdated HLC
      }
    }
    
    const entry = { val, hlc, deleted: false };
    await this.storeClient.hset(storeKey, key, JSON.stringify(entry));
    
    // Publish to cluster
    const mutation: any = { op: 'SET', session, key, val, hlc };
    await this.pubClient.publish('usp:mutations', JSON.stringify(mutation));
    
    return true;
  }

  async delete(session: string, key: string, hlc: string) {
    const storeKey = `usp:${session}`;
    
    // Check existing HLC
    const existingRaw = await this.storeClient.hget(storeKey, key);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw);
      if (existing.hlc && hlc && hlc < existing.hlc) {
        return false; // Outdated HLC
      }
    }
    
    // Tombstone
    const entry = { val: undefined, hlc, deleted: true };
    await this.storeClient.hset(storeKey, key, JSON.stringify(entry));
    
    // Publish to cluster
    const mutation = { op: 'DELETE', session, key, hlc };
    await this.pubClient.publish('usp:mutations', JSON.stringify(mutation));
    
    return true;
  }

  async getState(session: string) {
    const storeKey = `usp:${session}`;
    const allRaw = await this.storeClient.hgetall(storeKey);
    const state = {};
    
    for (const [key, raw] of Object.entries(allRaw as Record<string, string>)) {
      const entry = JSON.parse(raw);
      if (!entry.deleted && entry.val !== undefined) {
        state[key] = entry.val;
      }
    }
    
    return state;
  }
}
