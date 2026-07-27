import { HLC } from './hlc.js';

/**
 * USP Client — Browser-side transport.
 * Uses SSE (EventSource) for server→client push
 * and HTTP POST (fetch) for client→server mutations.
 * No WebSocket dependency — works with serverless backends.
 */
export class USPClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/api/usp';
    this.onRemoteSync = null;
    this.onInit = null;
    this.clientId = null;
    this.eventSource = null;
    this.hlc = null;
    this.offlineQueue = [];
    this.isOnline = typeof window !== 'undefined' ? navigator.onLine : true;

    // Listen to online/offline events if in browser
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._flushQueue());
      window.addEventListener('offline', () => { this.isOnline = false; });
    }
  }

  async connect() {
    console.log('[USP Client] Ready (SSE + HTTP POST transport)');
  }

  /** Subscribe to a session via SSE */
  subscribe(session) {
    const url = `${this.baseUrl}/subscribe?session=${encodeURIComponent(session)}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('init', (e) => {
      const data = JSON.parse(e.data);
      if (this.onInit) {
        this.onInit(data.session, data.state);
      }
    });

    this.eventSource.addEventListener('init-meta', (e) => {
      const data = JSON.parse(e.data);
      this.clientId = data.clientId;
      if (!this.hlc) {
        this.hlc = new HLC(this.clientId);
      } else {
        this.hlc.nodeId = this.clientId;
      }
    });

    this.eventSource.addEventListener('sync', (e) => {
      const data = JSON.parse(e.data);
      if (data.op === 'SET' && this.onRemoteSync) {
        if (this.hlc && data.hlc) {
          this.hlc.receive(data.hlc);
        }
        this.onRemoteSync(data.session, data.key, data.val, data.hlc);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('[USP Client] SSE connection lost, will auto-reconnect...');
      this.isOnline = false;
    };
    
    // Also mark as online when connection is open
    this.eventSource.onopen = () => {
      this.isOnline = true;
      this._flushQueue();
    };
  }

  /** Send a state mutation via HTTP POST */
  syncState(session, key, value) {
    if (!this.hlc) {
      this.hlc = new HLC(this.clientId || 'client-temp');
    }
    const timestamp = this.hlc.inc();
    const payload = { op: 'SET', session, key, val: value, clientId: this.clientId, hlc: timestamp };

    if (!this.isOnline) {
      this.offlineQueue.push(payload);
      return;
    }

    this._sendSyncRequest(payload);
  }

  _sendSyncRequest(payload) {
    fetch(`${this.baseUrl}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.error('[USP Client] Sync failed, queueing:', err);
      this.isOnline = false;
      this.offlineQueue.push(payload);
    });
  }

  _flushQueue() {
    this.isOnline = true;
    while (this.offlineQueue.length > 0) {
      const payload = this.offlineQueue.shift();
      this._sendSyncRequest(payload);
    }
  }

  exec(session, action, callback) {
    fetch(`${this.baseUrl}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'EXEC', session, action, clientId: this.clientId })
    })
      .then(r => r.json())
      .then(data => { if (callback) callback(data); })
      .catch(err => console.error('[USP Client] Exec failed:', err));
  }
}
