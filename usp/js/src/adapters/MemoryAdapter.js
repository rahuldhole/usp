export class MemoryAdapter {
  constructor() {
    this.store = new Map(); // session -> Map<key, val>
  }
  
  async init() {
    console.log('[MemoryAdapter] Ready');
  }

  async set(session, key, value) {
    if (!this.store.has(session)) {
      this.store.set(session, new Map());
    }
    this.store.get(session).set(key, value);
  }

  async getSessionState(session) {
    const sessionMap = this.store.get(session);
    if (!sessionMap) return {};
    const state = {};
    for (const [key, val] of sessionMap.entries()) {
      state[key] = val;
    }
    return state;
  }
}
