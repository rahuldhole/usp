import { process_sync_frame, get_storage_key, should_broadcast } from '../wasm/usp_wasm.js';
import { checkMaxSize } from './utils.js';

export class USPServer {
  adapter: any;
  clients: Set<any>;
  actionHandlers: Map<string, any>;

  constructor(adapter: any) {
    this.adapter = adapter;
    this.clients = new Set();
    this.actionHandlers = new Map();

    // Bind to adapter's cluster mutation events (e.g. for Redis Pub/Sub multi-node sync)
    if (typeof this.adapter.onMutation === 'function') {
      this.adapter.onMutation((mutation) => {
        // Prevent echo if we broadcasted it ourselves, although broadcast filters out exact same clientId echoes for the client.
        // Actually, to be safe and simple, we just broadcast. Clients filter their own echoes via clientId anyway.
        // Clients filter their own echoes via clientId
        this.broadcast(mutation);
      });
    }
  }

  // Register an action handler for EXEC mutations
  registerAction(action, handler) {
    this.actionHandlers.set(action, handler);
  }

  // HTTP POST /sync handler
  async handleSync(req: any, res: any) {
    try {
      const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      
      // Parse & Validate using WASM core engine
      const validatedFrameStr = process_sync_frame(payload);
      const mutation = JSON.parse(validatedFrameStr);

      const { op, key, val, action, hlc, clientId, options = {} } = mutation;
      const channel = options.channel || key;
      
      // Let Rust core determine the definitive storage key
      const storageKey = get_storage_key(validatedFrameStr);

      let success = true;
      if (op === 'SET') {
        success = await this.adapter.set(channel, storageKey, val, hlc, options);
      } else if (op === 'DELETE') {
        success = await this.adapter.delete(channel, storageKey, hlc, options);
      } else if (op === 'EXEC') {
        const handler = this.actionHandlers.get(action);
        if (handler) {
          await handler(channel, this.adapter, mutation);
        } else {
          console.warn(`No handler for action: ${action}`);
        }
      }

      if (success && (op === 'SET' || op === 'DELETE')) {
        this.broadcast(mutation);
      }

      res.status(200).json({ status: 'ok', success });
    } catch (err: any) {
      console.error("Sync error:", err);
      res.status(400).json({ error: typeof err === 'string' ? err : (err?.message || String(err)) });
    }
  }

  // HTTP GET /subscribe handler (SSE)
  async handleSubscribe(req: any, res: any) {
    const channels = req.query.channels ? req.query.channels.split(',') : [];
    if (channels.length === 0) {
      return res.status(400).send("Channels required");
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    if (res.flushHeaders) {
      res.flushHeaders();
    }
    // Send immediate connection ping comment to prevent reverse-proxy buffering
    res.write(': connected\n\n');

    // Send full state dump immediately
    for (const channel of channels) {
      const state = await this.adapter.getState(channel);
      
      const cleanState: any = {};
      for (const [k, v] of Object.entries(state)) {
        const cleanKey = k.startsWith(`${channel}:`) ? k.slice(channel.length + 1) : k;
        if (cleanKey.startsWith('private.') || cleanKey === 'private') continue; // Prevent leaking private state in INIT
        cleanState[cleanKey] = v;
      }
      
      res.write(`data: ${JSON.stringify({ op: 'INIT', session: channel, state: cleanState })}\n\n`);
    }

    const client = { channels, res };
    this.clients.add(client);

    req.on('close', () => {
      this.clients.delete(client);
    });
  }

  // Broadcast mutation to connected clients in the same channel
  broadcast(mutation: any) {
    const { options = {} } = mutation;
    const channel = options.channel || mutation.key;
    
    // Security: Ask Rust core if this mutation should be broadcasted
    const mutationStr = JSON.stringify(mutation);
    if (!should_broadcast(mutationStr)) return;
    
    const dataStr = `data: ${JSON.stringify(mutation)}\n\n`;
    for (const client of this.clients) {
      if (client.channels.includes(channel)) {
        client.res.write(dataStr);
      }
    }
  }

  // DX: Get state without dealing with internal prefixes
  async getState(key: string, options: any = {}) {
    const channel = options.channel || key;
    const fullState = await this.adapter.getState(channel);
    
    const mutationStr = JSON.stringify({ op: 'SET', key, val: null, options });
    const storageKey = get_storage_key(mutationStr);
    
    return fullState[storageKey];
  }

  // DX: Set state for a specific config and automatically broadcast it
  async setState(key: string, val: any, options: any = {}) {
    checkMaxSize(val, options);
    const channel = options.channel || key;
    
    const mutation: any = { op: 'SET', key, val, options };
    const mutationStr = JSON.stringify(mutation);
    const storageKey = get_storage_key(mutationStr);
    
    const hlc = Date.now() + "-0"; // Simple HLC for server-originated mutations
    await this.adapter.set(channel, storageKey, val, hlc, options);
    
    mutation.hlc = hlc;
    this.broadcast(mutation);
  }

  // DX: Bind state and return a handle with get/set methods
  bindState(key: string, options: any = {}) {
    const self = this;
    return {
      async get() {
        return await self.getState(key, options);
      },
      async set(val) {
        return await self.setState(key, val, options);
      }
    };
  }
}
