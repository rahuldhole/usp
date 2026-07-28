import { process_sync_frame } from '../wasm/usp_wasm.js';

export class USPServer {
  constructor(adapter) {
    this.adapter = adapter;
    this.clients = new Set();
    this.actionHandlers = new Map();
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

      const { session, op, key, val, action, hlc, clientId } = mutation;

      let success = true;
      if (op === 'SET') {
        success = await this.adapter.set(session, key, val, hlc);
      } else if (op === 'DELETE') {
        success = await this.adapter.delete(session, key, hlc);
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
    for (const [key, val] of Object.entries(fullState)) {
      res.write(`data: ${JSON.stringify({ op: 'SET', session, key, val })}\n\n`);
    }

    const client = { session, res };
    this.clients.add(client);

    req.on('close', () => {
      this.clients.delete(client);
    });
  }

  // Broadcast mutation to connected clients in the same session
  broadcast(session, mutation) {
    const dataStr = `data: ${JSON.stringify(mutation)}\n\n`;
    for (const client of this.clients) {
      if (client.session === session) {
        client.res.write(dataStr);
      }
    }
  }
}
