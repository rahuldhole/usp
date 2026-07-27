/**
 * GET /api/usp/subscribe?session=xxx
 * Server→Client: SSE stream for real-time state sync
 */
import { USP } from 'usp-js'

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const session = query.session as string;

  if (!session) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session parameter' });
  }

  const server = USP._getServer();
  if (!server) {
    throw createError({ statusCode: 503, statusMessage: 'USP Server not ready' });
  }

  // Set SSE headers
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const writer = event.node.res;

  // SSE send helper
  const send = (eventName: string, data: any) => {
    writer.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to the session
  const { clientId, unsubscribe } = server.subscribe(session, send, () => {});

  // Include clientId in the init event so the client can exclude itself from broadcasts
  // The init event is already sent by server.subscribe(), but we need to patch clientId in.
  // Actually, let's send it as a separate event:
  send('init-meta', { clientId });

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    writer.write(': heartbeat\n\n');
  }, 15000);

  // Cleanup on disconnect
  event.node.req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  // Don't end the response — keep SSE stream open
  event._handled = true;
});
