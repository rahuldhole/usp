import { USP } from 'usp-js'

export default defineNitroPlugin(async (nitroApp) => {
  console.log("Starting USP Server for Nuxt example (within Nitro)...");

  // Use port 4001 for this example's backend
  const server = await USP.initServer({
    redisUrl: 'redis://localhost:6379',
    port: 4001
  });

  server.registerAction('getState', async (session) => {
    const state = USP.useUsp(session);
    return state.todos || '[]';
  });
})
