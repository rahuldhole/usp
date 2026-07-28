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
// Assume local redis server on 6379
const adapter = new RedisAdapter();
const usp = new USPServer(adapter);

// API Routes
app.post('/api/usp/sync', (req, res) => usp.handleSync(req, res));
app.get('/api/usp/subscribe', (req, res) => usp.handleSubscribe(req, res));

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
