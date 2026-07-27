export class USPClient {
  constructor(options = {}) {
    this.url = options.url || 'ws://localhost:4000';
    this.onRemoteSync = null; // Hooked by USPManager
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log(`[USP Client] Connected to Sync Stream`);
        resolve();
      };
      
      this.ws.onerror = (err) => reject(err);

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.op === 'SET') {
          // Server broadcasted a state change, update local proxy cache
          if (this.onRemoteSync) {
            this.onRemoteSync(data.session, data.key, data.val);
          }
        } else {
          // It's likely an EXEC response
          const cb = this.callbacks.get(data.action);
          if (cb) cb(data);
        }
      };
    });
  }

  // Called by USPManager when local proxy is modified
  syncState(session, key, value) {
    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify({ op: 'SET', session, key, val: value }));
    }
  }

  exec(session, action, callback) {
    if (callback) this.callbacks.set(action, callback);
    this.ws.send(JSON.stringify({ op: "EXEC", session, action }));
  }
}
