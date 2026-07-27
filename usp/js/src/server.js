/**
 * USP Server — Serverless-compatible transport.
 * Uses SSE (Server-Sent Events) for server→client push
 * and HTTP POST for client→server mutations.
 * 
 * Designed to run inside any HTTP framework (Nitro, Express, Hono, etc.)
 * No standalone server needed — just mount the handler.
 */
import { MemoryAdapter } from './adapters/MemoryAdapter.js';

export class USPServer {
  constructor(options = {}) {
    this.adapter = options.adapter || new MemoryAdapter();
    this.actions = new Map();
    this.onRemoteSync = null;
    /** @type {Map<string, Set<(event: string, data: any) => void>>} */
    this.subscribers = new Map(); // session -> Set of SSE write functions
  }

  async start() {
    if (this.adapter.init) {
      await this.adapter.init();
    }
    console.log('[USP Server] State store ready using adapter:', this.adapter.constructor.name);
  }

  // ── State Operations ──────────────────────────────────────────────

  /** Write a key and broadcast to all SSE subscribers */
  async syncState(session, key, value) {
    await this.adapter.set(session, key, value);
    this._broadcast(session, { op: 'SET', session, key, val: value });
  }

  /** Get all state for a session */
  async getSessionState(session) {
    return await this.adapter.getSessionState(session);
  }

  // ── HTTP Handlers (mount these in your framework) ─────────────────

  /**
   * Handle incoming POST from client.
   * Expects JSON body: { op, session, key?, val?, action? }
   * Returns JSON response.
   */
  async handlePost(body) {
    if (body.op === 'SET') {
      await this.adapter.set(body.session, body.key, body.val);

      // Update local memory cache via Manager
      if (this.onRemoteSync) {
        this.onRemoteSync(body.session, body.key, body.val);
      }

      // Broadcast to all SSE subscribers (except the sender — handled via clientId)
      this._broadcast(body.session, {
        op: 'SET', session: body.session, key: body.key, val: body.val
      }, body.clientId);

      return { ok: true };

    } else if (body.op === 'EXEC') {
      const handler = this.actions.get(body.action);
      if (handler) {
        try {
          const result = await handler(body.session);
          return { status: 'success', action: body.action, result };
        } catch (err) {
          return { error: err.message || 'Action failed', action: body.action };
        }
      }
      return { error: 'Unknown action', action: body.action };
    }

    return { error: 'Unknown op' };
  }

  /**
   * Subscribe a client to a session via SSE.
   * @param {string} session
   * @param {(event: string, data: any) => void} send - function to push SSE events
   * @param {() => void} onClose - called when connection closes  
   * @returns {{ clientId: string, unsubscribe: () => void }}
   */
  async subscribe(session, send, onClose) {
    const clientId = Math.random().toString(36).slice(2);

    if (!this.subscribers.has(session)) {
      this.subscribers.set(session, new Map());
    }
    this.subscribers.get(session).set(clientId, send);

    // Send initial state
    const state = await this.getSessionState(session);
    send('init', { session, state });

    const unsubscribe = () => {
      const subs = this.subscribers.get(session);
      if (subs) {
        subs.delete(clientId);
        if (subs.size === 0) this.subscribers.delete(session);
      }
    };

    return { clientId, unsubscribe };
  }

  // ── Internal ──────────────────────────────────────────────────────

  _broadcast(session, data, excludeClientId) {
    const subs = this.subscribers.get(session);
    if (!subs) return;
    for (const [clientId, send] of subs) {
      if (clientId !== excludeClientId) {
        send('sync', data);
      }
    }
  }

  registerAction(actionName, handler) {
    this.actions.set(actionName, handler);
  }
}
