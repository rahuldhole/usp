export class MemoryAdapter {
  constructor() {
    this.store = new Map(); // session -> Map<key, val>
  }
  
  async init() {
    console.log('[MemoryAdapter] Ready');
  }

  async set(session, key, value, hlc) {
    if (!this.store.has(session)) {
      this.store.set(session, new Map());
    }
    const sessionMap = this.store.get(session);
    const existing = sessionMap.get(key);
    
    if (existing && existing.hlc && hlc) {
      if (existing.hlc > hlc) {
        return false; // Rejected, local is newer
      }
    }
    
    sessionMap.set(key, { value, hlc });
    return true;
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
