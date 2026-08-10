# JavaScript & TypeScript SDK

> Real-time state synchronization for Node.js servers and browser clients.
> Write to a variable — USP syncs it everywhere.

---

## Quick Start

Get a synced todo list running in under 5 minutes.

### 1. Install

```bash
pnpm add @rahuldhole/usp
```

### 2. Server (Node.js + Express)

```javascript
import express from 'express';
import fs from 'fs';
import path from 'path';
import { USPServer, MemoryAdapter, initSync } from '@rahuldhole/usp';

// Boot the Rust WASM engine (must happen before any USP calls)
const wasmBuffer = fs.readFileSync(
  path.join(import.meta.dirname, 'node_modules/@rahuldhole/usp/wasm/usp_wasm_bg.wasm')
);
initSync({ module: wasmBuffer });

// Create a server with in-memory storage
const adapter = new MemoryAdapter();
const usp = new USPServer(adapter);

const app = express();
app.use(express.json());

// Mount the two USP endpoints
app.post('/api/usp/sync', (req, res) => usp.handleSync(req, res));
app.get('/api/usp/subscribe', (req, res) => usp.handleSubscribe(req, res));

app.listen(3000, () => console.log('USP server running on :3000'));
```

### 3. Client (Browser)

```javascript
import { USPClient } from '@rahuldhole/usp';
import initWasm from '@rahuldhole/usp/wasm';

async function main() {
  // Boot the Rust WASM engine (async in browsers)
  await initWasm('/path/to/usp_wasm_bg.wasm');

  // Connect to the server
  const client = new USPClient('http://localhost:3000/api/usp');

  // Get a synced proxy for the "todos" channel
  const todos = client.useUsp('todos', {});

  // Write to it like a normal object — USP handles the rest
  todos['task_1'] = { text: 'Buy milk', completed: false };

  // Delete like a normal object
  delete todos['task_1'];
}

main();
```

That's it. Every connected client sees the change instantly.

---

## Core Concepts

Before diving into the API, here's how USP thinks about state:

| Concept | What it means |
|---------|---------------|
| **Channel** | A logical namespace that isolates state. Clients only receive updates for channels they subscribe to. Think of it as a "room". |
| **WASM Engine** | The core protocol logic (CRDT resolution, HLC clocks, security validation) runs in a Rust WebAssembly binary — shared by both server and client. It **must** be initialized before any USP calls. |
| **Proxy API** | A JavaScript `Proxy` object where `obj[key] = value` and `delete obj[key]` are intercepted and automatically synced across the network. Best for collections (todo lists, chat messages, dynamic key-value data). |
| **Bound State API** | A `{ value }` handle (client) or `{ get(), set() }` handle (server) for individual named values. Best for singletons (counters, toggles, config strings). |
| **Adapter** | The storage backend. `MemoryAdapter` for development, `RedisAdapter` for production clusters. Swap with zero application code changes. |
| **HLC** | Hybrid Logical Clock. USP generates these automatically. They provide causal ordering so that Last-Writer-Wins conflict resolution works correctly across distributed nodes. |

---

## Initialization

USP's protocol engine is compiled from Rust to WebAssembly. Both the server and client must initialize it before doing anything else.

### Node.js (synchronous)

```javascript
import fs from 'fs';
import path from 'path';
import { initSync } from '@rahuldhole/usp';

const wasmBuffer = fs.readFileSync(
  path.join(import.meta.dirname, 'node_modules/@rahuldhole/usp/wasm/usp_wasm_bg.wasm')
);
initSync({ module: wasmBuffer });

// Now you can create USPServer, register actions, etc.
```

`initSync` loads the binary synchronously from disk. Call it once at startup, before creating any `USPServer` instance.

### Browser (asynchronous)

```javascript
import initWasm from '@rahuldhole/usp/wasm';

await initWasm('/usp_wasm_bg.wasm');

// Now you can create USPClient, bind state, etc.
```

The WASM file is fetched over the network, so initialization is `async`. Make sure your server serves `usp_wasm_bg.wasm` as a static file.

---

## Proxy API — Dynamic Collections

Use `client.useUsp(channel, options)` to get a `Proxy` object that behaves like a normal JavaScript object but syncs every mutation across the network in real time.

```javascript
const state = client.useUsp('todos', {});
```

### Create (SET)

```javascript
const id = 'task_' + Math.random().toString(36).substr(2, 9);
state[id] = { text: 'Buy groceries', completed: false };
```

Assigning a key on the proxy:
1. Updates local state immediately (optimistic)
2. Fires all `subscribe` listeners for instant UI re-render
3. Dispatches a `SET` mutation to the server via HTTP POST
4. Server persists to the adapter and broadcasts to all other clients via SSE

### Update (SET)

USP proxies are **shallow** — to update nested fields, replace the entire top-level value:

```javascript
// ✅ Correct — replace the whole object
state[id] = { ...state[id], completed: true };

// ❌ Won't sync — deep mutation isn't intercepted
state[id].completed = true;
```

### Delete (DELETE)

```javascript
delete state[id];
```

Dispatches a `DELETE` mutation. The server stores a tombstone to prevent out-of-order resurrection, then broadcasts the deletion to all clients.

### Read

```javascript
const todo = state[id];           // read a single item
const allKeys = Object.keys(state); // enumerate all keys
```

The proxy reads directly from the local in-memory state — no network call.

### Security

The WASM engine intercepts every proxy mutation and **synchronously throws** if you attempt to write or delete a key starting with `private.`:

```javascript
try {
  state['private.secret'] = 'oops';
} catch (err) {
  // "Forbidden: Cannot mutate private namespace key 'private.secret' from client"
}
```

This runs entirely in the client WASM engine — the mutation never reaches the network.

---

## Bound State API — Named Singletons

Use `bindState(key, options)` for individual named values like counters, toggles, or config strings.

### Client Side

`bindState` returns an object with a reactive `value` getter/setter:

```javascript
const notice = client.bindState('global_notice', {
  channel: 'todos',
  maxSize: 35,         // enforce a 35-byte limit
});

// Read
console.log(notice.value); // => "Welcome! Max 35 bytes."

// Write (syncs instantly)
notice.value = 'Short msg';

// Oversized write throws synchronously — never hits the network
try {
  notice.value = 'This string is definitely longer than thirty-five bytes, so it will fail';
} catch (err) {
  // "ERR_PAYLOAD_TOO_LARGE: Value size (72 bytes) exceeds maximum allowed size (35 bytes)"
}
```

### Server Side

On the server, `bindState` returns `{ get(), set() }` — both return Promises because backend storage is asynchronous:

```javascript
const counter = usp.bindState('visit_counter', { channel: 'metrics' });

// Read
const current = await counter.get(); // => 42

// Write (persists + broadcasts to all subscribed clients)
await counter.set(current + 1);
```

The server also exposes lower-level methods:

```javascript
// getState — read a single key
const val = await usp.getState('visit_counter', { channel: 'metrics' });

// setState — write a single key (generates HLC, persists, broadcasts)
await usp.setState('visit_counter', 43, { channel: 'metrics' });
```

---

## State Options

Both `bindState` and `useUsp` accept an options object:

```typescript
{
  channel: string;    // Logical namespace. Clients only receive updates for subscribed channels.
                      // Defaults to the key name (bindState) or must be provided (useUsp).

  maxSize: number;    // Max byte size of the value. Enforced synchronously on the client
                      // AND double-validated by the Rust engine on the server.
                      // Throws ERR_PAYLOAD_TOO_LARGE if exceeded.

  access: string;     // 'global' (default) — synced to all subscribers
                      // 'server'           — hidden from clients, never broadcasted via SSE
                      // 'client'           — ephemeral, node-local

  password: string;   // Required when reading/writing access: 'server' state.
}
```

---

## Channels & Scoping

Channels isolate state into logical rooms. A client only receives mutations for the channels it has subscribed to.

```javascript
// Client A subscribes to "lobby" — sees only lobby state
const lobby = client.useUsp('lobby', {});

// Client B subscribes to "match_492" — sees only match state
const match = client.useUsp('match_492', {});
```

Subscribing is implicit: calling `useUsp()` or `bindState()` with a `channel` option automatically subscribes the client to that channel via the SSE connection.

When a client first connects to a channel, the server sends an `INIT` event containing the full current state snapshot — no separate "fetch initial state" API call needed.

---

## Private State (Server-Only)

Any key prefixed with `private.` is server-only. It is:
- **Never included** in `INIT` state dumps sent to clients
- **Never broadcasted** via SSE
- **Blocked on the client** — the WASM engine throws `ERR_SECURITY_FORBIDDEN` if a client tries to read or mutate it

```javascript
// Server: store a secret
await usp.setState('private.openai_key', 'sk-abc123...', {
  channel: 'config',
  access: 'server',
  password: 'admin_pwd',
});

// Server: read it back
const key = await usp.getState('private.openai_key', { channel: 'config' });
```

Clients connected to the `config` channel will never see `private.openai_key` in their state.

---

## Server Actions (EXEC)

For logic that must run on the server — batch operations, database access, third-party API calls — register server actions with `registerAction` and trigger them from the client with `dispatchSync`.

### Register an action (server)

```javascript
usp.registerAction('clearCompleted', async (session, db, mutation) => {
  const state = await db.getState(session);

  for (const [key, val] of Object.entries(state)) {
    if (val.completed) {
      await db.delete(session, key, mutation.hlc);
      usp.broadcast({
        op: 'DELETE', session, key,
        hlc: mutation.hlc,
        options: { channel: session },
      });
    }
  }
});
```

The handler receives:
| Parameter | Type | Description |
|-----------|------|-------------|
| `session` | `string` | The channel name derived from the mutation's options |
| `db` | `MemoryAdapter \| RedisAdapter` | The storage adapter — call `db.getState()`, `db.set()`, `db.delete()` |
| `mutation` | `object` | The full validated mutation frame (`{ op, action, hlc, clientId, options }`) |

### Dispatch from the client

```javascript
client.dispatchSync({
  op: 'EXEC',
  options: { channel: 'todos' },
  action: 'clearCompleted',
});
```

The server processes the action, mutates state through the adapter, and broadcasts the resulting `SET`/`DELETE` operations to all subscribed clients. The client doesn't need to send any payload — the server reads directly from the state heap.

---

## Reactivity — Subscribing to State Changes

Use `client.subscribe(callback)` to react to state changes. The callback fires on every local or remote mutation.

```javascript
const unsubscribe = client.subscribe((globalState) => {
  const todos = globalState.todos || {};

  const list = document.getElementById('todo-list');
  list.innerHTML = '';

  Object.entries(todos).forEach(([id, todo]) => {
    const li = document.createElement('li');
    li.textContent = todo.text;
    if (todo.completed) li.classList.add('completed');
    list.appendChild(li);
  });
});

// Later: stop listening
unsubscribe();
```

The `globalState` object is keyed by channel name. Each channel contains the current key-value state as a plain object.

**What triggers the callback:**
- Local proxy writes (`state[key] = val`)
- Local `bindState` writes (`handle.value = val`)
- Remote mutations received via SSE
- `INIT` events when first connecting to a channel

---

## Offline Support

`USPClient` monitors `navigator.onLine` automatically. When the browser goes offline:

1. **UI stays responsive** — local state updates and `subscribe` callbacks still fire
2. **Mutations queue** — all `SET`, `DELETE`, and `EXEC` operations are stored in an internal `offlineQueue`
3. **Auto-flush on reconnect** — when the browser fires the `online` event, the queue flushes and syncs with the server

No extra code required. This is built into the client.

---

## Storage Adapters

### MemoryAdapter

In-memory `Map`. No external dependencies. State is lost when the process exits.

```javascript
import { MemoryAdapter } from '@rahuldhole/usp';

const adapter = new MemoryAdapter();
const usp = new USPServer(adapter);
```

Best for: local development, tests, single-node apps with ephemeral state.

### RedisAdapter

Uses `ioredis` for persistent storage and Redis Pub/Sub for cross-node synchronization. Deploy 10 Node.js workers behind a load balancer — any mutation on Worker A is instantly published via Redis and broadcasted to clients on Workers B–J.

```javascript
import { RedisAdapter } from '@rahuldhole/usp';

const adapter = new RedisAdapter({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
});
const usp = new USPServer(adapter);
```

Best for: production, multi-node clusters, serverless deployments.

### Migrating from Memory to Redis

It's a one-line change — swap the adapter. Zero application code changes:

```diff
- import { MemoryAdapter } from '@rahuldhole/usp';
- const adapter = new MemoryAdapter();
+ import { RedisAdapter } from '@rahuldhole/usp';
+ const adapter = new RedisAdapter({ host: 'redis.prod.internal' });
```

---

## Transport Architecture

USP uses **SSE + HTTP POST** — no WebSockets required.

| Direction | Method | Endpoint |
|-----------|--------|----------|
| Server → Client | SSE (Server-Sent Events) | `GET /api/usp/subscribe?channels=ch1,ch2` |
| Client → Server | HTTP POST | `POST /api/usp/sync` |

**Why not WebSockets?**
- SSE auto-reconnects natively in every browser via `EventSource`
- HTTP POST works with any serverless function, CDN, or API gateway
- No persistent server process required — compatible with edge runtimes and serverless platforms

The client manages the connection automatically. Calling `useUsp()` or `bindState()` adds the channel to the subscription set and (re)connects the SSE stream.

---

## Error Codes

All errors follow a standardized protocol, enforced at both the client SDK and the Rust WASM engine:

| Code | Cause | Where it throws |
|------|-------|-----------------|
| `ERR_PAYLOAD_TOO_LARGE` | Value exceeds `maxSize` bytes | Client SDK (synchronous) + Rust engine |
| `ERR_SECURITY_FORBIDDEN` | Client tried to mutate a `private.*` key | Client WASM engine (synchronous) |
| `ERR_SERIALIZATION` | Malformed JSON or incompatible data type | Rust engine |
| `ERR_INVALID_HLC` | Corrupted or out-of-order HLC timestamp | Rust engine |
| `ERR_INVALID_MUTATION` | Missing `op`, `key`, or `val` in the mutation frame | Rust engine |

`ERR_PAYLOAD_TOO_LARGE` and `ERR_SECURITY_FORBIDDEN` throw **synchronously** on the client — the mutation never reaches the network. The server independently re-validates as a defense-in-depth measure.

---

## API Reference

<details>
<summary>Click to view API Reference</summary>

### `USPClient`

```typescript
class USPClient {
  constructor(endpoint: string)

  // Proxy API — returns a Proxy for dynamic key-value collections
  useUsp(channel: string, options?: StateOptions): Record<string, any>

  // Bound State — returns { value } getter/setter for a single named key
  bindState(key: string, options?: StateOptions): { value: any }

  // Subscribe to all state changes (local + remote)
  subscribe(callback: (globalState: Record<string, any>) => void): () => void

  // Dispatch a raw mutation (SET, DELETE, EXEC) to the server
  dispatchSync(mutation: Mutation): Promise<void>
}
```

### `USPServer`

```typescript
class USPServer {
  constructor(adapter: MemoryAdapter | RedisAdapter)

  // Mount these on your HTTP framework
  handleSync(req: Request, res: Response): Promise<void>
  handleSubscribe(req: Request, res: Response): Promise<void>

  // Read a single key from the state heap
  getState(key: string, options?: StateOptions): Promise<any>

  // Write a key, persist it, and broadcast to subscribers
  setState(key: string, val: any, options?: StateOptions): Promise<void>

  // Convenience handle with get()/set() for a single key
  bindState(key: string, options?: StateOptions): { get(): Promise<any>, set(val: any): Promise<void> }

  // Register a server-side action handler for EXEC mutations
  registerAction(name: string, handler: ActionHandler): void

  // Push a mutation to all SSE clients in the matching channel
  broadcast(mutation: Mutation): void

  // Connected SSE clients (read-only access for advanced use)
  clients: Set<{ channels: string[], res: Response }>

  // The underlying storage adapter
  adapter: MemoryAdapter | RedisAdapter
}
```

### Types

```typescript
interface StateOptions {
  channel?: string;
  maxSize?: number;
  access?: 'global' | 'server' | 'client';
  password?: string;
}

interface Mutation {
  op: 'SET' | 'DELETE' | 'EXEC';
  key?: string;
  val?: any;
  action?: string;
  hlc?: string;
  clientId?: string;
  session?: string;
  options?: StateOptions;
}

type ActionHandler = (
  session: string,
  db: MemoryAdapter | RedisAdapter,
  mutation: Mutation
) => Promise<void>;
```

</details>

---

## Full Example — Todo App

A complete working example with proxy state, bound state, server actions, and reactive rendering.

<details>
<summary>Click to view Todo App Example</summary>

### Server (`server.js`)

```javascript
import express from 'express';
import { USPServer, MemoryAdapter, initSync } from '@rahuldhole/usp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Boot WASM
const wasmBuffer = fs.readFileSync(
  path.join(__dirname, 'node_modules/@rahuldhole/usp/wasm/usp_wasm_bg.wasm')
);
initSync({ module: wasmBuffer });

// 2. Create server
const adapter = new MemoryAdapter();
const usp = new USPServer(adapter);

// 3. Register server action
usp.registerAction('clearCompleted', async (session, db, mutation) => {
  const state = await db.getState(session);
  for (const [key, val] of Object.entries(state)) {
    if (val.completed) {
      await db.delete(session, key, mutation.hlc);
      usp.broadcast({
        op: 'DELETE', session, key,
        hlc: mutation.hlc,
        options: { channel: session },
      });
    }
  }
});

// 4. Seed initial state using the elegant bindState API
const visitCounter = usp.bindState('visit_counter', { channel: 'todos' });
const globalNotice = usp.bindState('global_notice', { channel: 'todos' });

await visitCounter.set(0);
await globalNotice.set('Welcome! Max 35 bytes.');

// 5. Wire up Express
const app = express();
app.use(express.json());
app.post('/api/usp/sync', (req, res) => usp.handleSync(req, res));
app.get('/api/usp/subscribe', (req, res) => usp.handleSubscribe(req, res));
app.use(express.static('public'));

app.listen(3000, () => console.log('Running on http://localhost:3000'));
```

### Client (`public/app.js`)

```javascript
import { USPClient } from '@rahuldhole/usp';
import initWasm from '@rahuldhole/usp/wasm';

async function main() {
  await initWasm('/usp_wasm_bg.wasm');

  const client = new USPClient('http://localhost:3000/api/usp');

  // Dynamic collection via Proxy
  const todos = client.useUsp('todos', {});

  // Singleton via bindState (with maxSize validation)
  const notice = client.bindState('global_notice', { channel: 'todos', maxSize: 35 });

  // Reactive render loop
  client.subscribe((state) => {
    const data = state.todos || {};
    const list = document.getElementById('todo-list');
    list.innerHTML = '';

    Object.entries(data).forEach(([id, todo]) => {
      if (id === 'visit_counter' || id === 'global_notice') return;

      const li = document.createElement('li');
      li.textContent = todo.text;

      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = todo.completed ? 'Undo' : 'Done';
      toggleBtn.onclick = () => {
        todos[id] = { ...todo, completed: !todo.completed };
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.onclick = () => delete todos[id];

      li.append(toggleBtn, deleteBtn);
      list.appendChild(li);
    });
  });

  // Add todo
  document.getElementById('add-btn').onclick = () => {
    const input = document.getElementById('todo-input');
    const text = input.value.trim();
    if (!text) return;

    const id = 'task_' + Math.random().toString(36).substr(2, 9);
    todos[id] = { text, completed: false };
    input.value = '';
  };

  // Server action: clear completed
  document.getElementById('clear-btn').onclick = () => {
    client.dispatchSync({
      op: 'EXEC',
      options: { channel: 'todos' },
      action: 'clearCompleted',
    });
  };

  // Update notice with maxSize guard
  document.getElementById('notice-btn').onclick = () => {
    try {
      notice.value = document.getElementById('notice-input').value;
    } catch (err) {
      alert(err.message);
    }
  };
}

main();
```

</details>

---

## Full Example — Multiserver Cluster

This example demonstrates how to run USP across multiple Node.js workers using the `RedisAdapter`. It showcases global state, node-local ephemeral state, and private server state.

<details>
<summary>Click to view Multiserver Cluster Example</summary>

### Worker Node (`worker.js`)

```javascript
import express from 'express';
import { USPServer, RedisAdapter, initSync } from '@rahuldhole/usp';
import fs from 'fs';

// 1. Boot WASM
initSync({ module: fs.readFileSync('./usp_wasm_bg.wasm') });

// 2. Connect to Redis Cluster
const adapter = new RedisAdapter({ host: '127.0.0.1', port: 6379 });
const usp = new USPServer(adapter);

const app = express();
const PORT = process.env.PORT || 3000;

app.post('/api/usp/sync', (req, res) => usp.handleSync(req, res));
app.get('/api/usp/subscribe', async (req, res) => {
  await usp.handleSubscribe(req, res);
  // Send Node-Local counter immediately upon connecting
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ 
      op: 'SET', key: 'counter', val: nodeVisits, 
      options: { channel: 'server_' + PORT, access: 'client' } 
    })}\n\n`);
  }
});

let nodeVisits = 0;

// 3. Periodic Node-Local State Broadcast (Every 1s)
// Uses access: 'client' so it doesn't persist to the Redis database
setInterval(() => {
  nodeVisits++;
  for (const client of usp.clients) {
    if (client.channels.includes('cluster_demo')) {
      client.res.write(`data: ${JSON.stringify({ 
        op: 'SET', key: 'counter', val: nodeVisits, 
        options: { channel: 'server_' + PORT, access: 'client' } 
      })}\n\n`);
    }
  }
}, 1000);

// 4. Middleware to track visits
app.use(async (req, res, next) => {
  if (req.path === '/') {
    // Global State (Synced across all workers via Redis Pub/Sub)
    const globalCounter = usp.bindState('global_counter', { channel: 'cluster_demo' });
    const newVal = (await globalCounter.get() || 0) + 1;
    await globalCounter.set(newVal);
    
    // Private State (Server-only, completely hidden from clients)
    await usp.setState('private.secret', `super_secret_${Date.now()}`, { 
      channel: 'cluster_demo', access: 'server', password: 'admin123' 
    });
  }
  next();
});

app.listen(PORT, () => console.log(`Worker started on port ${PORT}`));
```

</details>

---

## Running the Demos

The repository includes two runnable examples:

### `examples/todo-js` — Single-server todo app
Uses `MemoryAdapter`. Demonstrates proxy state, bound state with `maxSize`, server actions, and reactive rendering.

```bash
cd examples/todo-js
pnpm install
pnpm start
# Open http://localhost:3000
```

### `examples/multiserver-js` — Multi-node cluster
Uses `RedisAdapter` with 3 Node.js workers behind HAProxy. Demonstrates cross-node sync, private state, and node-local ephemeral state.

Requires `docker` and `docker-compose`:

```bash
task multiserver:start
# Open http://localhost:3000 in multiple tabs
```

### `examples/nuxtjs` — Nuxt Full-stack App
Uses `MemoryAdapter`. Demonstrates proxy state, server actions, and Vue 3 Reactivity (Composition API) within a modern Nuxt framework.

```bash
cd examples/nuxtjs
pnpm install
pnpm run dev
# Open http://localhost:3000
```
