## Unified State Protocol (USP) Specification

### Overview

The **Unified State Protocol (USP)** is an open, language-agnostic network protocol designed to unify client and server memory spaces into a single logical execution environment.

By utilizing a centralized **volatile in-memory state heap** (e.g., Redis) alongside an **asynchronous sync stream** (e.g., WebSockets, WebTransport), USP eliminates traditional API design, manual serialization, and data-heavy request payloads across any language or platform stack.

---

### System Architecture

```
                          ┌────────────────────────────────┐
                          │    USP STATE HEAP (REDIS/RAM)   │
                          │  session:123 -> Hash / JSON    │
                          └───────────────▲────────────────┘
                                          │
             ┌────────────────────────────┴────────────────────────────┐
   Client Diff Stream                                         Direct Memory Read
  (WebSocket / Binary)                                       (Sub-Millisecond TCP)
             │                                                         │
┌────────────┴────────────┐                               ┌────────────┴────────────┐
│       CLIENT NODE       │                               │       SERVER NODE       │
│  (JS, Swift, Dart, C++) │ ─── Zero-Payload Exec Trigger ─►│  (Rust, Go, Python, JS) │
└─────────────────────────┘                               └─────────────────────────┘

```

---

### Core Protocol Mechanics

#### 1. Dual-Namespace Partitioning

USP isolates variables into two memory domains within the shared heap:

* **`public` Domain:** Bi-directionally synchronized between the client runtime and the USP heap. Holds UI state and active user session variables.
* **`private` Domain:** Strictly accessible by authenticated server processes. Holds security-sensitive variables (e.g., API keys, database credentials) that are never transmitted to the client.

#### 2. Diff-Based State Synchronization

When a local variable mutates in client memory, a USP client runtime intercepts the mutation and emits a lightweight delta frame to the heap:

```json
{
  "op": "SET",
  "session": "sess_8f3a9",
  "key": "user.theme",
  "val": "dark"
}

```

#### 3. Zero-Payload Execution Triggers

Instead of serializing and transmitting state inside request bodies (as in REST or GraphQL), the client sends an execution trigger containing only the function identifier and session reference:

```json
{
  "op": "EXEC",
  "session": "sess_8f3a9",
  "action": "processOrder"
}

```

Upon receipt, the server process reads `sess_8f3a9` directly from the shared memory heap in microseconds, executes the logic, and mutates the heap as needed.

#### 4. Automatic Ephemeral Lifecycle Management

Session memory is volatile by design. The heap maintains an active **Time-To-Live (TTL)** counter (e.g., 1800s) on every session key. When client nodes disconnect or timeout, the memory heap automatically garbage-collects the state, preventing memory leaks without manual cleanup code.

---

### Key Protocol Benefits

* **Language Agnostic:** Works natively with any client (Swift, Flutter, C++, JavaScript) and any backend (Rust, Go, Python, Node.js).
* **Zero Payload Overhead:** Eliminates heavy JSON request bodies in backend calls.
* **No API Mapping:** Developers manipulate local runtime memory rather than building REST endpoints, GraphQL schemas, or gRPC definitions.