import { v4 as uuidv4 } from 'uuid';
import { createUspProxy } from './proxy.js';

export class USPClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.clientId = uuidv4();
    this.hlcCounter = 0;
    this.state = {};
    this.listeners = new Set();
    this.eventSource = null;
  }

  generateHlc() {
    this.hlcCounter++;
    return `${Date.now()}-${this.hlcCounter.toString().padStart(4, '0')}-${this.clientId.substring(0, 5)}`;
  }

  connect(session) {
    this.eventSource = new EventSource(`${this.endpoint}/subscribe?session=${session}`);
    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Ignore echoes
      if (data.clientId === this.clientId) return;
      
      this.applyMutation(data);
    };
  }

  applyMutation(mutation) {
    if (mutation.op === 'SET') {
      this.state[mutation.key] = mutation.val;
    } else if (mutation.op === 'DELETE') {
      delete this.state[mutation.key];
    }
    
    // Trigger re-render listeners
    this.listeners.forEach(fn => fn(this.state));
  }

  async dispatchSync(mutation) {
    mutation.clientId = this.clientId;
    if (mutation.op === 'SET' || mutation.op === 'DELETE') {
      mutation.hlc = this.generateHlc();
    }
    
    // Fire-and-forget POST
    try {
      await fetch(`${this.endpoint}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation)
      });
    } catch (err) {
      console.error("USP Sync failed:", err);
    }
  }

  useUsp(session, initialState = {}) {
    this.state = { ...initialState };
    this.connect(session);
    return createUspProxy(session, this.state, this);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
