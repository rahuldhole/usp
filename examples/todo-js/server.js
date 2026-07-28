import express from 'express';
import { USPServer, MemoryAdapter, initSync } from '@rahuldhole/usp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize WASM synchronously for Node environment
const wasmBuffer = fs.readFileSync(path.join(__dirname, '../../usp/bindings/ts/wasm/usp_wasm_bg.wasm'));
initSync({ module: wasmBuffer });

const app = express();
app.use(cors());
app.use(express.json());

// Initialize USP with Memory Storage Adapter
const adapter = new MemoryAdapter();
const usp = new USPServer(adapter);

// Register EXEC server action for "clearCompleted"
usp.registerAction("clearCompleted", async (session, db, mutation) => {
    console.log(`Executing server action clearCompleted for session: ${session}`);
    const state = await db.getState(session);
    for (const [key, val] of Object.entries(state)) {
        if (val.completed) {
            await db.delete(session, key, mutation.hlc);
            usp.broadcast(session, { op: 'DELETE', session, key });
        }
    }
});

// API Routes
app.post('/api/usp/sync', (req, res) => usp.handleSync(req, res));
app.get('/api/usp/subscribe', (req, res) => usp.handleSubscribe(req, res));

// Seed initial values in the 'todos' session
adapter.set('todos', 'visit_counter', 0, "0000000000000-0");
adapter.set('todos', 'global_notice', 'Welcome! Max 35 bytes.', "0000000000000-0");

// Increment visit counter on each page visit
app.use(async (req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        const state = await adapter.getState('todos');
        const currentVal = state.visit_counter || 0;
        const newVal = currentVal + 1;
        
        // Use a simple timestamp string for HLC
        const hlc = Date.now() + "-0";
        await adapter.set('todos', 'visit_counter', newVal, hlc);
        
        // Broadcast to all connected clients
        usp.broadcast('todos', { op: 'SET', session: 'todos', key: 'visit_counter', val: newVal, hlc });
    }
    next();
});

// Static files
app.use(express.static('public'));

// Serve the local USP bindings directly to the browser for testing (so we don't need a bundler)
app.use('/usp-sdk', express.static(path.join(__dirname, '../../usp/bindings/ts')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Todo JS app (USP powered) running on http://localhost:${PORT}`);
});
