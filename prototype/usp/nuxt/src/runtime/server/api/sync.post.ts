import { defineEventHandler, readBody, createError } from 'h3'
import { USP } from 'usp-js/server'

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const server = USP._getServer();
  if (!server) {
    throw createError({ statusCode: 503, statusMessage: 'USP Server not ready' });
  }
  return server.handlePost(body);
});
