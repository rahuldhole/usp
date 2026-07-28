import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USPServer, MemoryAdapter } from 'usp-protocol';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/usp', express.static(path.join(__dirname, '../../usp')));

// Initialize USP Server
const adapter = new MemoryAdapter();
const uspServer = new USPServer({ adapter });

await uspServer.start();

// Server action: Clear all completed items (Demonstrates Zero-Payload EXEC Trigger)
uspServer.registerAction('clearCompleted', async (session) => {
  const state = await uspServer.getSessionState(session);
  for (const key in state) {
    const entry = state[key];
    const val = entry?.value || entry;
    if (val && val.completed) {
      await uspServer.syncState(session, key, null);
    }
  }
  return { status: 'cleared' };
});

// Endpoint: HTTP POST for client->server mutations & EXEC triggers
app.post('/api/usp/sync', async (req, res) => {
  const result = await uspServer.handlePost(req.body);
  if (result.status === 403) {
    return res.status(403).json(result);
  }
  res.json(result);
});

// Endpoint: GET SSE stream for server->client push
app.get('/api/usp/subscribe', async (req, res) => {
  const session = req.query.session || 'todos';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const { unsubscribe } = await uspServer.subscribe(session, send);

  req.on('close', () => {
    unsubscribe();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 USP Todo CRUD Server listening on http://localhost:${PORT}`);
});
