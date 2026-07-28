import express from 'express';
import { USPServer, RedisAdapter, initSync } from '@rahuldhole/usp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize WASM synchronously
const wasmBuffer = fs.readFileSync(path.join(__dirname, '../../usp/bindings/js/wasm/usp_wasm_bg.wasm'));
initSync({ module: wasmBuffer });

const app = express();
app.use(cors());
app.use(express.json());

// Initialize USP with Redis Adapter
// Configure Redis connection (defaults to local 6379)
const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
};
const adapter = new RedisAdapter(redisConfig);
const usp = new USPServer(adapter);

// API Routes
app.post('/api/usp/sync', (req, res) => usp.handleSync(req, res));
app.get('/api/usp/subscribe', (req, res) => usp.handleSubscribe(req, res));

// Increment counters on each page visit
app.use(async (req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        // Use the new DX methods that abstract away internal storage keys
        
        // 1. Global State
        const globalState = await usp.getState('cluster_demo', 'global');
        const newVal = (globalState['counter'] || 0) + 1;
        await usp.setState('cluster_demo', 'global', 'counter', newVal);
        
        // 2. Private State (Server-only)
        const privateSecret = `secret_${Date.now()}`;
        await usp.setState('cluster_demo', 'private', 'secret', privateSecret);
        
        console.log(`[Worker ${process.env.PORT}] 🟢 Page visited! Incremented global counter to ${newVal}`);
        
        // 3. Node-Local State (Ephemeral, specific to this instance)
        // We bypass Redis adapter and just broadcast to clients on this node
        for (const client of usp.clients) {
            if (client.session === 'cluster_demo') {
                client.res.write(`data: ${JSON.stringify({ op: 'SET', session: 'cluster_demo', scope: 'node', key: 'counter', val: newVal })}\n\n`);
            }
        }
    }
    next();
});

// Helper route to identify which server we hit
app.get('/api/node-id', (req, res) => {
    res.json({ port: process.env.PORT });
});

// Static files
app.use(express.static('public'));
app.use('/usp-sdk', express.static(path.join(__dirname, '../../usp/bindings/js')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Worker] Started on port ${PORT}`);
});
