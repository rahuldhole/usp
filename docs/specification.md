## Unified State Protocol (USP) Specification

### Overview

The **Unified State Protocol (USP)** is an open, language-agnostic network protocol designed to unify client and server memory spaces into a single logical execution environment.

By utilizing a **persistent state heap** (e.g., SQLite, Redis) alongside a **serverless-compatible sync transport** (SSE for server→client push, HTTP POST for client→server mutations), USP eliminates traditional API design, manual serialization, and data-heavy request payloads across any language or platform stack.

> **Serverless-first:** USP requires no persistent connections or dedicated WebSocket servers. It works natively with edge runtimes, serverless functions, and traditional servers alike.

---

### System Architecture

```
                          ┌────────────────────────────────┐
                          │     USP STATE HEAP (Adapter)    │
                          │   (Memory, SQLite, Redis)      │
                          │  session:todos -> { key: val } │
                          └───────────────▲────────────────┘
                                          │
             ┌────────────────────────────┴────────────────────────────┐
   SSE Stream (server→client)                              HTTP POST (client→server)
   GET /api/usp/subscribe                                  POST /api/usp/sync
             │                                                        │
┌────────────┴────────────┐                              ┌────────────┴────────────┐
│       CLIENT NODE       │                              │       SERVER NODE       │
│  (JS, Swift, Dart, C++) │                              │  (Nitro, Hono, Express) │
│                         │ ── Zero-Payload Exec Trigger ─►│  (Rust, Go, Python, JS) │
└─────────────────────────┘                              └─────────────────────────┘

```

---

### Swappable Storage Adapters

The USP server core abstracts the state heap into swappable adapters:

1. **MemoryAdapter**: In-memory `Map`-based storage for simple ephemeral setups without external dependencies.
2. **SQLiteAdapter**: Persistent, file-based storage using `better-sqlite3`. Great for single-node deployments.
3. **RedisAdapter**: Distributed storage using `ioredis`. Required for multi-node or serverless setups behind a load balancer.

---

### Framework Wrappers Strategy

To minimize boilerplate, the base `usp-js` library remains framework-agnostic. Framework-specific wrappers (like `nuxt-usp`) are provided to integrate tightly with native paradigms.

A Framework Wrapper should:
1. Auto-inject the server-side API endpoints (`/api/usp/subscribe` and `/api/usp/sync`).
2. Register the server plugin to initialize the `USPServer` with the user's chosen storage adapter.
3. Auto-import the `useUsp` composable/hook for the client.

This keeps the user's project clean and strictly configuration-driven.

---

### Transport Layer

#### SSE + HTTP POST (Serverless-Compatible)

USP uses a split transport model that works with any HTTP server, including serverless platforms:

| Direction | Mechanism | Endpoint |
|-----------|-----------|----------|
| Server → Client | **SSE** (Server-Sent Events) | `GET /api/usp/subscribe?session=<id>` |
| Client → Server | **HTTP POST** | `POST /api/usp/sync` |

**Why not WebSockets?**
- WebSockets require persistent server processes — incompatible with serverless/edge runtimes
- SSE auto-reconnects natively in all browsers via `EventSource`
- HTTP POST works with any serverless function, CDN, or API gateway
- The combination provides the same real-time UX with zero infrastructure constraints

---

### Core Protocol Mechanics

#### 1. Granular State Configuration

USP provides ultimate control over state synchronization through a configuration-first approach, rather than rigid scopes or namespaces. Every state mutation or binding accepts an `options` hash:

```javascript
{
  channel: 'string', // Groups the state logically. Defaults to the variable name. Replaces the concept of a session or a user prefix.
  password: 'string', // Optional string for securing access to private states.
  access: 'global | server | client', // Access control: 'global' (everyone), 'server' (private), 'client' (ephemeral/node-local). Defaults to 'global'.
  mode: 'duplex | simplex-server-to-client | simplex-client-to-server | half-duplex' // Sync directionality. Defaults to 'duplex'.
}
```

This ensures maximum flexibility without polluting state keys with arbitrary prefixes.

#### 2. Diff-Based State Synchronization

When a local variable mutates in client memory, a USP client runtime intercepts the mutation and emits a lightweight delta frame via HTTP POST:

```json
{
  "op": "SET",
  "session": "todos",
  "key": "user.theme",
  "val": "dark",
  "clientId": "k7f3x"
}
```

The server persists the change to the state heap (SQLite) and broadcasts it to all other connected clients via their SSE streams:

```
event: sync
data: {"op":"SET","session":"todos","key":"user.theme","val":"dark"}
```

#### 3. Session Subscription & Initial State

When a client subscribes to a session, the server sends the complete current state as an SSE `init` event:

```
event: init
data: {"session":"todos","state":{"user.theme":"dark","items":"[...]"}}
```

This eliminates the need for separate "fetch initial state" API calls.

#### 4. Zero-Payload Execution Triggers

Instead of serializing and transmitting state inside request bodies (as in REST or GraphQL), the client sends an execution trigger containing only the function identifier and session reference:

```json
{
  "op": "EXEC",
  "session": "todos",
  "action": "processOrder"
}
```

Upon receipt, the server process reads the session directly from the shared memory heap, executes the logic, and mutates the heap as needed.

#### 5. Automatic Ephemeral Lifecycle Management

Session memory is volatile by design. The heap maintains an active **Time-To-Live (TTL)** counter (e.g., 1800s) on every session key. When client nodes disconnect or timeout, the memory heap automatically garbage-collects the state, preventing memory leaks without manual cleanup code.

---

### Key Protocol Benefits

* **Serverless-First:** Works natively on Vercel, Cloudflare Workers, AWS Lambda, and traditional servers — no WebSocket infrastructure needed.
* **Language Agnostic:** Works natively with any client (Swift, Flutter, C++, JavaScript) and any backend (Rust, Go, Python, Node.js).
* **Zero Payload Overhead:** Eliminates heavy JSON request bodies in backend calls.
* **No API Mapping:** Developers manipulate local runtime memory rather than building REST endpoints, GraphQL schemas, or gRPC definitions.
* **Auto-Reconnect:** SSE natively reconnects on connection loss, providing resilient real-time sync without custom retry logic.