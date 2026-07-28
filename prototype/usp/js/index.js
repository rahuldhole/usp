import { GlobalManager } from './src/core.js';

export const USP = {
  async initServer(options = {}) {
    const { USPServer } = await import('./src/server.js');
    const server = new USPServer(options);
    await server.start();
    GlobalManager.init('server', server);
    return server;
  },

  async initClient(options = {}) {
    const { USPClient } = await import('./src/client.js');
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

  /** Get the underlying server instance (for mounting HTTP handlers) */
  _getServer() {
    return GlobalManager.engine;
  },

  exec(session, action, callback) {
    if (GlobalManager.mode !== 'client') throw new Error("EXEC can only be initiated from a client.");
    GlobalManager.engine.exec(session, action, callback);
  }
};
