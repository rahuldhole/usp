import { process_sync_frame } from '../wasm/usp_wasm.js';

export class USPServer {
  constructor(adapter) {
    this.adapter = adapter;
    this.clients = new Set();
    this.actionHandlers = new Map();

    // Bind to adapter's cluster mutation events (e.g. for Redis Pub/Sub multi-node sync)
    if (typeof this.adapter.onMutation === 'function') {
      this.adapter.onMutation((mutation) => {
        // Prevent echo if we broadcasted it ourselves, although broadcast filters out exact same clientId echoes for the client.
        // Actually, to be safe and simple, we just broadcast. Clients filter their own echoes via clientId anyway.
        this.broadcast(mutation.session, mutation);
      });
    }
  }

  // Register an action handler for EXEC mutations
  registerAction(action, handler) {
    this.actionHandlers.set(action, handler);
  }

  // HTTP POST /sync handler
  async handleSync(req, res) {
    try {
      const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      
      // Parse & Validate using WASM core engine
      const validatedFrameStr = process_sync_frame(payload);
      const mutation = JSON.parse(validatedFrameStr);

      const { session, op, key, val, action, hlc, clientId, scope = 'global' } = mutation;
      const userId = req.query.userId;
      
      // Store userId in mutation so broadcast can filter it
      mutation.userId = userId;

      // Convert scope + key into internal storage key
      let storageKey = `${scope}:${key}`;
      if (scope === 'user') {
        if (!userId) throw new Error("Cannot mutate user scope without userId");
        storageKey = `user:${userId}:${key}`;
      }

      let success = true;
      if (op === 'SET') {
        success = await this.adapter.set(session, storageKey, val, hlc);
      } else if (op === 'DELETE') {
        success = await this.adapter.delete(session, storageKey, hlc);
      } else if (op === 'EXEC') {
        const handler = this.actionHandlers.get(action);
        if (handler) {
          await handler(session, this.adapter, mutation);
        } else {
          console.warn(`No handler for action: ${action}`);
        }
      }

      if (success && (op === 'SET' || op === 'DELETE')) {
        this.broadcast(session, mutation);
      }

      res.status(200).json({ status: 'ok', success });
    } catch (err) {
      console.error("Sync error:", err);
      res.status(400).json({ error: err.message });
    }
  }

  // HTTP GET /subscribe handler (SSE)
  async handleSubscribe(req, res) {
    const session = req.query.session;
    if (!session) {
      return res.status(400).send("Session required");
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
    const fullState = await this.adapter.getState(session);
    
    // We will extract a potential userId if provided in query for filtering
    const userId = req.query.userId;
    
    for (const [storageKey, val] of Object.entries(fullState)) {
      // Security: Never transmit private keys
      if (storageKey.startsWith('private:')) continue;
      
      let scope, key;
      if (storageKey.startsWith('user:')) {
         const parts = storageKey.split(':');
         const storageUserId = parts[1];
         key = parts.slice(2).join(':');
         
         // Security: Filter user-specific keys if they don't belong to this connected client
         if (userId && storageUserId !== userId) continue;
         scope = 'user'; // Send to client as scope 'user'
      } else {
         const parts = storageKey.split(':');
         scope = parts[0];
         key = parts.slice(1).join(':');
      }

      res.write(`data: ${JSON.stringify({ op: 'SET', session, scope, key, val })}\n\n`);
    }

    const client = { session, userId, res };
    this.clients.add(client);

    req.on('close', () => {
      this.clients.delete(client);
    });
  }

  // Broadcast mutation to connected clients in the same session
  broadcast(session, mutation) {
    const { scope = 'global', userId: mutationUserId } = mutation;
    
    // Security: Never broadcast private state
    if (scope === 'private') return;
    
    // Remove internal userId before sending to clients
    const broadcastMutation = { ...mutation };
    delete broadcastMutation.userId;
    
    const dataStr = `data: ${JSON.stringify(broadcastMutation)}\n\n`;
    for (const client of this.clients) {
      if (client.session === session) {
        // Security: Filter user-specific keys
        if (scope === 'user') {
          if (!client.userId || client.userId !== mutationUserId) continue;
        }
        client.res.write(dataStr);
      }
    }
  }

  // DX: Get state for a specific scope without dealing with internal prefixes
  async getState(session, scope = 'global', userId = null) {
    const fullState = await this.adapter.getState(session);
    const result = {};
    const prefix = scope === 'user' ? `user:${userId}:` : `${scope}:`;
    
    for (const [storageKey, val] of Object.entries(fullState)) {
      if (storageKey.startsWith(prefix)) {
        const key = storageKey.substring(prefix.length);
        result[key] = val;
      }
    }
    return result;
  }

  // DX: Set state for a specific scope and automatically broadcast it
  async setState(session, scope = 'global', key, val, userId = null) {
    let storageKey = `${scope}:${key}`;
    if (scope === 'user') {
      if (!userId) throw new Error("Cannot mutate user scope without userId");
      storageKey = `user:${userId}:${key}`;
    }
    
    const hlc = Date.now() + "-0"; // Simple HLC for server-originated mutations
    await this.adapter.set(session, storageKey, val, hlc);
    
    this.broadcast(session, { op: 'SET', session, scope, key, val, hlc, userId });
  }
}
