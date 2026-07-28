/**
 * Browser-safe USP entry point.
 * Only exposes client-side functionality — no native deps.
 */
import { GlobalManager } from './src/core.js';
import { USPClient } from './src/client.js';

export const USP = {
  async initClient(options = {}) {
    const client = new USPClient(options);
    await client.connect();
    GlobalManager.init('client', client);
    return client;
  },

  useUsp(session) {
    return GlobalManager.useUsp(session);
  },

  onSync(callback) {
    GlobalManager.onSync(callback);
  },

  exec(session, action, callback) {
    if (GlobalManager.mode !== 'client') throw new Error("EXEC can only be initiated from a client.");
    GlobalManager.engine.exec(session, action, callback);
  }
};
