import { v4 as uuidv4 } from 'uuid';
import { createUspProxy } from './proxy.js';

export class USPClient {
  endpoint: string;
  clientId: string;
  lastTs: number;
  hlcCounter: number;
  state: any;
  listeners: Set<any>;
  eventSource: any;
  offlineQueue: any[];
  isOnline: boolean;
  channels: Set<string>;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
    this.clientId = uuidv4();
    this.lastTs = Date.now();
    this.hlcCounter = 0;
    this.state = {};
    this.listeners = new Set();
    this.eventSource = null;
    this.offlineQueue = [];
    this.isOnline = typeof window !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true;

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => this.flushOfflineQueue());
      window.addEventListener('offline', () => { this.isOnline = false; });
    }
  }

  generateHlc() {
    const now = Date.now();
    if (now > this.lastTs) {
      this.lastTs = now;
      this.hlcCounter = 0;
    } else {
      this.hlcCounter++;
    }
    const countStr = this.hlcCounter.toString(36).padStart(4, '0');
    return `${this.lastTs}-${countStr}-${this.clientId.substring(0, 5)}`;
  }

  receiveHlc(remoteHlc: string) {
    if (!remoteHlc || typeof remoteHlc !== 'string') return;
    const parts = remoteHlc.split('-');
    if (parts.length < 2) return;
    const remoteTs = parseInt(parts[0], 10);
    const remoteCount = parseInt(parts[1], 36);
    const now = Date.now();

    if (now > this.lastTs && now > remoteTs) {
      this.lastTs = now;
      this.hlcCounter = 0;
    } else if (this.lastTs === remoteTs) {
      this.hlcCounter = Math.max(this.hlcCounter, !isNaN(remoteCount) ? remoteCount : 0) + 1;
    } else if (this.lastTs > remoteTs) {
      this.hlcCounter++;
    } else if (!isNaN(remoteTs)) {
      this.lastTs = remoteTs;
      this.hlcCounter = (!isNaN(remoteCount) ? remoteCount : 0) + 1;
    }
  }

  connect(channels: string[]) {
    let subscribeUrl = this.endpoint;
    if (subscribeUrl.includes('?')) {
      subscribeUrl = subscribeUrl.replace('?', '/subscribe?');
      subscribeUrl += `&channels=${channels.join(',')}`;
    } else {
      subscribeUrl += `/subscribe?channels=${channels.join(',')}`;
    }

    this.eventSource = new EventSource(subscribeUrl);
    this.eventSource.onopen = () => {
      this.isOnline = true;
      this.flushOfflineQueue();
    };
    this.eventSource.onerror = () => {
      this.isOnline = false;
    };
    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.hlc) {
        this.receiveHlc(data.hlc);
      }
      // Ignore echoes
      if (data.clientId === this.clientId) return;
      
      this.applyMutation(data);
    };
  }

  notifyListeners() {
    this.listeners.forEach(fn => fn(this.state));
  }

  applyMutation(mutation: any) {
    const channel = mutation.options?.channel || mutation.key;
    if (!this.state[channel]) this.state[channel] = {};

    if (mutation.op === 'SET') {
      this.state[channel][mutation.key] = mutation.val;
    } else if (mutation.op === 'DELETE') {
      delete this.state[channel][mutation.key];
    }
    
    // Trigger re-render listeners
    this.notifyListeners();
  }

  async dispatchSync(mutation: any) {
    mutation.clientId = this.clientId;
    if (mutation.op === 'SET' || mutation.op === 'DELETE') {
      mutation.hlc = this.generateHlc();
    }
    
    if (!this.isOnline) {
      this.offlineQueue.push(mutation);
      return;
    }

    this._sendPost(mutation);
  }

  async _sendPost(mutation: any) {
    try {
      let syncUrl = this.endpoint;
      if (syncUrl.includes('?')) {
        syncUrl = syncUrl.replace('?', '/sync?');
      } else {
        syncUrl += '/sync';
      }
      
      await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation)
      });
    } catch (err) {
      console.warn("USP Sync failed, queueing offline:", err);
      this.isOnline = false;
      this.offlineQueue.push(mutation);
    }
  }

  flushOfflineQueue() {
    this.isOnline = true;
    while (this.offlineQueue.length > 0) {
      const mutation = this.offlineQueue.shift();
      this._sendPost(mutation);
    }
  }

  bindState(key: string, options: any = {}) {
    const channel = options.channel || key;
    if (!this.channels) this.channels = new Set();
    this.channels.add(channel);

    if (!this.state[channel]) this.state[channel] = {};
    if (options.initialState !== undefined && this.state[channel][key] === undefined) {
      this.state[channel][key] = options.initialState;
    }

    if (!this.eventSource) {
      this.connect(Array.from(this.channels));
    }

    const self = this;
    return {
      get value() {
        return self.state[channel][key];
      },
      set value(val) {
        self.state[channel][key] = val;
        self.dispatchSync({ op: 'SET', key, val, options });
        self.notifyListeners();
      }
    };
  }

  subscribe(fn: any) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
