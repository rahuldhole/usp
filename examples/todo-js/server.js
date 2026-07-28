import express from 'express';
import { USPServer, MemoryAdapter, initSync } from '@rahuldhole/usp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize WASM synchronously for Node environment
const wasmBuffer = fs.readFileSync(path.join(__dirname, '../../usp/bindings/js/wasm/usp_wasm_bg.wasm'));
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

// Static files
app.use(express.static('public'));

// Serve the local USP bindings directly to the browser for testing (so we don't need a bundler)
app.use('/usp-sdk', express.static(path.join(__dirname, '../../usp/bindings/js')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Todo JS app (USP powered) running on http://localhost:${PORT}`);
});
