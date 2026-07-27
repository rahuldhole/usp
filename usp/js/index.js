import { GlobalManager } from './src/core.js';
import { USPServer } from './src/server.js';
import { USPClient } from './src/client.js';

export const USP = {
  async initServer(options = {}) {
    const server = new USPServer(options);
    await server.start();
    GlobalManager.init('server', server);
    return server;
  },

  async initClient(options = {}) {
    const client = new USPClient(options);
    await client.connect();
    GlobalManager.init('client', client);
    return client;
  },

  useUsp(session) {
    return GlobalManager.useUsp(session);
  },

  // Helper to trigger remote executions from client
  exec(session, action, callback) {
    if (GlobalManager.mode !== 'client') throw new Error("EXEC can only be initiated from a client.");
    GlobalManager.engine.exec(session, action, callback);
  }
};
