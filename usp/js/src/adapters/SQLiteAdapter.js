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
        PRIMARY KEY (session, key)
      )
    `);
    this._stmtSet = this.db.prepare(
      'INSERT OR REPLACE INTO usp_state (session, key, value) VALUES (?, ?, ?)'
    );
    this._stmtGetAll = this.db.prepare(
      'SELECT key, value FROM usp_state WHERE session = ?'
    );
    console.log('[SQLiteAdapter] Ready:', this.dbPath);
  }

  async set(session, key, value) {
    this._stmtSet.run(session, key, value);
  }

  async getSessionState(session) {
    const rows = this._stmtGetAll.all(session);
    const state = {};
    for (const row of rows) {
      state[row.key] = row.value;
    }
    return state;
  }
}
