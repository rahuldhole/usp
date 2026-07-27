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
    });

    this.eventSource.addEventListener('sync', (e) => {
      const data = JSON.parse(e.data);
      if (data.op === 'SET' && this.onRemoteSync) {
        this.onRemoteSync(data.session, data.key, data.val);
      }
    });

    this.eventSource.onerror = () => {
      console.warn('[USP Client] SSE connection lost, will auto-reconnect...');
    };
  }

  /** Send a state mutation via HTTP POST */
  syncState(session, key, value) {
    fetch(`${this.baseUrl}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'SET', session, key, val: value, clientId: this.clientId })
    }).catch(err => console.error('[USP Client] Sync failed:', err));
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
