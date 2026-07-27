import { createUspProxy } from './proxy.js';

export class USPManager {
  constructor() {
    this.mode = null; // 'server' or 'client'
    this.engine = null; // USPServer or USPClient
    this.stateCache = new Map(); // session -> { stateObj, proxy }
  }

  init(mode, engine) {
    this.mode = mode;
    this.engine = engine;
    
    // Wire up the engine to notify us when remote state changes
    this.engine.onRemoteSync = (session, key, value) => {
      this.applyRemoteSync(session, key, value);
    };

    if (this.mode === 'client') {
      this.engine.onInit = (session, state) => {
        if (!this.stateCache.has(session)) {
          const targetObj = {};
          const proxy = createUspProxy(session, targetObj, this);
          this.stateCache.set(session, { targetObj, proxy });
        }
        const { targetObj } = this.stateCache.get(session);
        for (const key in state) {
          targetObj[key] = state[key];
          if (this._onSyncCallback) {
            this._onSyncCallback(session, key, state[key]);
          }
        }
      };
    }
  }

  useUsp(session) {
    if (!this.engine) {
      throw new Error("USP not initialized. Call USP.initServer() or USP.initClient() first.");
    }

    if (!this.stateCache.has(session)) {
      const targetObj = {};
      const proxy = createUspProxy(session, targetObj, this);
      this.stateCache.set(session, { targetObj, proxy });

      if (this.mode === 'client' && this.engine.subscribe) {
        this.engine.subscribe(session);
      }
    }

    return this.stateCache.get(session).proxy;
  }

  dispatchSync(session, key, value) {
    if (this.engine) {
      this.engine.syncState(session, key, value);
    }
  }

  applyRemoteSync(session, key, value) {
    if (!this.stateCache.has(session)) {
      // If we receive a sync for a session we aren't tracking locally, we might want to track it
      const targetObj = {};
      const proxy = createUspProxy(session, targetObj, this);
      this.stateCache.set(session, { targetObj, proxy });
    }
    const { targetObj } = this.stateCache.get(session);
    // Update local cache without triggering a dispatch
    targetObj[key] = value;
    
    // Notify listeners
    if (this._onSyncCallback) {
      this._onSyncCallback(session, key, value);
    }
  }

  onSync(callback) {
    this._onSyncCallback = callback;
  }
}

export const GlobalManager = new USPManager();
