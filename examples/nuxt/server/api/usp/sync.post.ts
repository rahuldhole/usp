/**
 * POST /api/usp/sync
 * Client→Server: Handle SET and EXEC operations
 */
import { USP } from 'usp-js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const server = USP._getServer();
  if (!server) {
    throw createError({ statusCode: 503, statusMessage: 'USP Server not ready' });
  }
  return server.handlePost(body);
});
