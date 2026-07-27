import { createClient } from 'redis';
import { WebSocketServer } from 'ws';

export class USPServer {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || 'redis://localhost:6379';
    this.port = options.port || 4000;
    this.redisClient = createClient({ url: this.redisUrl });
    this.actions = new Map();
    this.onRemoteSync = null; // Called by USPManager
    this.wss = null;
  }

  async start() {
    this.redisClient.on('error', (err) => console.log('Redis Client Error', err));
    await this.redisClient.connect();
    console.log('[USP Server] Connected to USP State Heap (Redis)');

    this.wss = new WebSocketServer({ port: this.port });
    
    this.wss.on('connection', (ws) => {
      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          await this.handleMessage(ws, msg);
        } catch (err) {
          console.error('[USP Server] Invalid message format', err);
        }
      });
    });

    console.log(`[USP Server] Listening on ws://localhost:${this.port}`);
  }

  // Called by USPManager when a local proxy is modified on the server
  async syncState(session, key, value) {
    // 1. Write to Redis Heap
    await this.redisClient.hSet(session, `public:${key}`, value);
    // 2. Broadcast to all clients
    if (this.wss) {
      const msg = JSON.stringify({ op: 'SET', session, key, val: value });
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(msg);
        }
      });
    }
  }

  async handleMessage(ws, msg) {
    if (msg.op === 'SET') {
      // Client updated state. Write to Redis.
      await this.redisClient.hSet(msg.session, `public:${msg.key}`, msg.val);
      
      // Update local memory cache via Manager
      if (this.onRemoteSync) {
        this.onRemoteSync(msg.session, msg.key, msg.val);
      }
      
      // Broadcast to other clients
      const broadcastMsg = JSON.stringify(msg);
      this.wss.clients.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(broadcastMsg);
        }
      });

    } else if (msg.op === 'EXEC') {
      const handler = this.actions.get(msg.action);
      if (handler) {
        try {
          const result = await handler(msg.session);
          ws.send(JSON.stringify({ status: 'success', action: msg.action, result }));
        } catch (err) {
          ws.send(JSON.stringify({ error: err.message || 'Action failed', action: msg.action }));
        }
      } else {
        ws.send(JSON.stringify({ error: 'Unknown action', action: msg.action }));
      }
    }
  }

  registerAction(actionName, handler) {
    this.actions.set(actionName, handler);
  }
}
