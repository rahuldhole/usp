import { createUspProxy } from './proxy.js';
import { HLC } from './hlc.js';

export class USPManager {
  constructor() {
    this.mode = null; // 'server' or 'client'
    this.engine = null; // USPServer or USPClient
    this.stateCache = new Map(); // session -> { targetObj, proxy, hlcMap }
  }

  init(mode, engine) {
    this.mode = mode;
    this.engine = engine;
    
    // Wire up the engine to notify us when remote state changes
    this.engine.onRemoteSync = (session, key, value, hlc) => {
      this.applyRemoteSync(session, key, value, hlc);
    };

    if (this.mode === 'client') {
      this.engine.onInit = (session, state) => {
        if (!this.stateCache.has(session)) {
          const targetObj = {};
          const hlcMap = new Map();
          const proxy = createUspProxy(session, targetObj, this);
          this.stateCache.set(session, { targetObj, proxy, hlcMap });
        }
        const { targetObj, hlcMap } = this.stateCache.get(session);
        for (const key in state) {
          const entry = state[key];
          let val = entry;
          let hlc = null;
          if (entry !== null && typeof entry === 'object' && 'value' in entry && 'hlc' in entry) {
            val = entry.value;
            hlc = entry.hlc;
          }
          targetObj[key] = val;
          if (hlc) hlcMap.set(key, hlc);
          
          if (this._onSyncCallback) {
            this._onSyncCallback(session, key, val);
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
      const hlcMap = new Map();
      const proxy = createUspProxy(session, targetObj, this);
      this.stateCache.set(session, { targetObj, proxy, hlcMap });

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

  applyRemoteSync(session, key, value, hlc) {
    if (!this.stateCache.has(session)) {
      // If we receive a sync for a session we aren't tracking locally, we might want to track it
      const targetObj = {};
      const hlcMap = new Map();
      const proxy = createUspProxy(session, targetObj, this);
      this.stateCache.set(session, { targetObj, proxy, hlcMap });
    }
    const { targetObj, hlcMap } = this.stateCache.get(session);
    
    // Check HLC timestamp if provided
    if (hlc) {
      const currentHlc = hlcMap.get(key);
      if (currentHlc && HLC.compare(currentHlc, hlc) > 0) {
        // Local state is newer, ignore remote sync
        return;
      }
      hlcMap.set(key, hlc);
    }

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
