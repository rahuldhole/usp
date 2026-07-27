/**
 * USP Server — Serverless-compatible transport.
 * Uses SSE (Server-Sent Events) for server→client push
 * and HTTP POST for client→server mutations.
 * 
 * Designed to run inside any HTTP framework (Nitro, Express, Hono, etc.)
 * No standalone server needed — just mount the handler.
 */
import Database from 'better-sqlite3';

export class USPServer {
  constructor(options = {}) {
    this.dbPath = options.dbPath || './usp-state.db';
    this.actions = new Map();
    this.onRemoteSync = null;
    /** @type {Map<string, Set<(event: string, data: any) => void>>} */
    this.subscribers = new Map(); // session -> Set of SSE write functions

    // Initialize SQLite
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usp_state (
        session TEXT NOT NULL,
        key     TEXT NOT NULL,
        value   TEXT,
        PRIMARY KEY (session, key)
      )
    `);
    this._stmtSet = this.db.prepare(
      'INSERT OR REPLACE INTO usp_state (session, key, value) VALUES (?, ?, ?)'
    );
    this._stmtGetAll = this.db.prepare(
      'SELECT key, value FROM usp_state WHERE session = ?'
    );
  }

  async start() {
    console.log('[USP Server] SQLite state store ready:', this.dbPath);
  }

  // ── State Operations ──────────────────────────────────────────────

  /** Write a key and broadcast to all SSE subscribers */
  syncState(session, key, value) {
    this._stmtSet.run(session, key, value);
    this._broadcast(session, { op: 'SET', session, key, val: value });
  }

  /** Get all state for a session */
  getSessionState(session) {
    const rows = this._stmtGetAll.all(session);
    const state = {};
    for (const row of rows) {
      state[row.key] = row.value;
    }
    return state;
  }

  // ── HTTP Handlers (mount these in your framework) ─────────────────

  /**
   * Handle incoming POST from client.
   * Expects JSON body: { op, session, key?, val?, action? }
   * Returns JSON response.
   */
  async handlePost(body) {
    if (body.op === 'SET') {
      this._stmtSet.run(body.session, body.key, body.val);

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
  subscribe(session, send, onClose) {
    const clientId = Math.random().toString(36).slice(2);

    if (!this.subscribers.has(session)) {
      this.subscribers.set(session, new Map());
    }
    this.subscribers.get(session).set(clientId, send);

    // Send initial state
    const state = this.getSessionState(session);
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
