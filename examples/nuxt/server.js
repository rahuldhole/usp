import { USP } from 'usp-js'

console.log("Starting USP Server for Nuxt example...");

// Use port 4001 for this example's backend
const server = await USP.initServer({
  redisUrl: 'redis://localhost:6379',
  port: 4001
});

server.registerAction('getState', async (session) => {
  const state = USP.useUsp(session);
  return state.todos || '[]';
});
