import { createClient } from 'redis';
import { WebSocketServer } from 'ws';

export class USPServer {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || 'redis://localhost:6379';
    this.port = options.port || 4000;
    this.redisClient = createClient({ url: this.redisUrl });
    this.actions = new Map();
  }

  async start() {
    this.redisClient.on('error', (err) => console.log('Redis Client Error', err));
    await this.redisClient.connect();
    console.log('[USP] Connected to USP State Heap (Redis)');

    this.wss = new WebSocketServer({ port: this.port });
    
    this.wss.on('connection', (ws) => {
      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          await this.handleMessage(ws, msg);
        } catch (err) {
          console.error('[USP] Invalid message format', err);
        }
      });
      
      ws.on('close', () => {
        // Cleanup on disconnect
      });
    });

    console.log(`[USP] Server listening on ws://localhost:${this.port}`);
  }

  async stop() {
    if (this.wss) {
      this.wss.close();
    }
    await this.redisClient.quit();
  }

  registerAction(actionName, handler) {
    this.actions.set(actionName, handler);
  }

  async readState(session, key) {
    return await this.redisClient.hGet(session, `public:${key}`);
  }

  async handleMessage(ws, msg) {
    if (msg.op === 'SET') {
      await this.redisClient.hSet(msg.session, `public:${msg.key}`, msg.val);
      console.log(`[USP SYNC] Heap updated: ${msg.key} = ${msg.val} (Session: ${msg.session})`);
    } else if (msg.op === 'EXEC') {
      console.log(`[USP EXEC] Trigger received: ${msg.action} (Session: ${msg.session})`);
      const handler = this.actions.get(msg.action);
      
      if (handler) {
        try {
          const result = await handler(msg.session, this);
          ws.send(JSON.stringify({ status: 'success', action: msg.action, result }));
        } catch (err) {
          console.error(`[USP] Action error:`, err);
          ws.send(JSON.stringify({ error: err.message || 'Action failed', action: msg.action }));
        }
      } else {
        ws.send(JSON.stringify({ error: 'Unknown action', action: msg.action }));
      }
    } else {
      console.log(`[USP] Unknown operation: ${msg.op}`);
    }
  }
}
