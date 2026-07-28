import Database from 'better-sqlite3';

export class SQLiteAdapter {
  constructor(dbPath = './usp-state.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usp_state (
        session TEXT NOT NULL,
        key     TEXT NOT NULL,
        value   TEXT,
        hlc     TEXT,
        PRIMARY KEY (session, key)
      )
    `);
    try {
      this.db.exec(`ALTER TABLE usp_state ADD COLUMN hlc TEXT`);
    } catch (e) {
      // Column might already exist
    }
    this._stmtSet = this.db.prepare(
      'INSERT OR REPLACE INTO usp_state (session, key, value, hlc) VALUES (?, ?, ?, ?)'
    );
    this._stmtGetAll = this.db.prepare(
      'SELECT key, value, hlc FROM usp_state WHERE session = ?'
    );
    this._stmtGet = this.db.prepare(
      'SELECT hlc FROM usp_state WHERE session = ? AND key = ?'
    );
    console.log('[SQLiteAdapter] Ready:', this.dbPath);
  }

  async set(session, key, value, hlc) {
    const existing = this._stmtGet.get(session, key);
    if (existing && existing.hlc && hlc && existing.hlc > hlc) {
      return false;
    }
    this._stmtSet.run(session, key, value, hlc);
    return true;
  }

  async getSessionState(session) {
    const rows = this._stmtGetAll.all(session);
    const state = {};
    for (const row of rows) {
      state[row.key] = { value: row.value, hlc: row.hlc };
    }
    return state;
  }
}
