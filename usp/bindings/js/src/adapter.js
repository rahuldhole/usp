export class MemoryAdapter {
  constructor() {
    this.store = new Map();
  }

  async get(session, key) {
    return this.store.get(`${session}:${key}`);
  }

  async set(session, key, val, hlc) {
    const storeKey = `${session}:${key}`;
    const existing = this.store.get(storeKey);
    
    if (existing && existing.hlc && hlc && hlc < existing.hlc) {
      return false; // Outdated HLC
    }
    
    this.store.set(storeKey, { val, hlc });
    return true;
  }

  async delete(session, key, hlc) {
    const storeKey = `${session}:${key}`;
    const existing = this.store.get(storeKey);
    
    if (existing && existing.hlc && hlc && hlc < existing.hlc) {
      return false; // Outdated HLC
    }
    
    this.store.delete(storeKey);
    return true;
  }

  async getState(session) {
    const state = {};
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${session}:`)) {
        state[k.substring(session.length + 1)] = v.val;
      }
    }
    return state;
  }
}
