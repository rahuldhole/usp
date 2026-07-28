export class MemoryAdapter {
  store: Map<string, any>;

  constructor() {
    this.store = new Map();
  }

  async get(session: string, key: string) {
    const entry = this.store.get(`${session}:${key}`);
    if (!entry || entry.deleted) return undefined;
    return entry;
  }

  async set(session: string, key: string, val: any, hlc: string) {
    const storeKey = `${session}:${key}`;
    const existing = this.store.get(storeKey);
    
    if (existing && existing.hlc && hlc && hlc < existing.hlc) {
      return false; // Outdated HLC
    }
    
    this.store.set(storeKey, { val, hlc, deleted: false });
    return true;
  }

  async delete(session: string, key: string, hlc: string) {
    const storeKey = `${session}:${key}`;
    const existing = this.store.get(storeKey);
    
    if (existing && existing.hlc && hlc && hlc < existing.hlc) {
      return false; // Outdated HLC
    }
    
    // Store tombstone instead of actual deletion to prevent out-of-order resurrection
    this.store.set(storeKey, { val: undefined, hlc, deleted: true });
    return true;
  }

  async getState(session: string) {
    const state: any = {};
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${session}:`) && !v.deleted && v.val !== undefined) {
        state[k.substring(session.length + 1)] = v.val;
      }
    }
    return state;
  }
}
