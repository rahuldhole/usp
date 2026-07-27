export class USPClient {
  constructor(options = {}) {
    this.url = options.url || 'ws://localhost:4000';
    this.session = options.session || `sess_${Math.random().toString(36).substr(2, 9)}`;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log(`[USP System] Connected to Async Sync Stream (Session: ${this.session})`);
        resolve();
      };
      
      this.ws.onerror = (err) => {
        reject(err);
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const cb = this.callbacks.get(data.action);
        if (cb) {
          cb(data);
        }
        if (this.onMessage) {
          this.onMessage(data); // Expose raw messages to caller
        }
      };
    });
  }

  setState(key, val) {
    const msg = {
      op: "SET",
      session: this.session,
      key,
      val
    };
    this.ws.send(JSON.stringify(msg));
  }

  exec(action, callback) {
    if (callback) {
      this.callbacks.set(action, callback);
    }
    const msg = {
      op: "EXEC",
      session: this.session,
      action
    };
    this.ws.send(JSON.stringify(msg));
  }
}
