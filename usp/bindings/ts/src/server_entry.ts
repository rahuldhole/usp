import { USPServer } from './server.js';
import { MemoryAdapter } from './adapter.js';
import { RedisAdapter } from './redis_adapter.js';
import { initSync } from '../wasm/usp_wasm.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Auto-initialize the WASM runtime synchronously for Node.js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.resolve(__dirname, '../wasm/usp_wasm_bg.wasm');
const wasmBuffer = fs.readFileSync(wasmPath);
initSync({ module: wasmBuffer });

export { USPServer, MemoryAdapter, RedisAdapter };
