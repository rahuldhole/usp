# Unified State Protocol (USP)

USP is a blazing-fast, language-agnostic protocol for real-time, bi-directional state synchronization. 

It provides seamless state synchronization across a cluster of distributed backend servers and their connected clients, powered by a core Rust engine and distributed via highly optimized WebAssembly (WASM).

## Architecture

USP is designed around a single source of truth—the `usp-core`—which defines the protocol logic, CRDT difference engine, and security policies.

- **`usp-core` (Rust)**: The heart of the protocol. Handles state parsing, Hybrid Logical Clock (HLC) tracking, LWW (Last-Writer-Wins) Map conflict resolution, and security validation.
- **`usp-wasm` (Rust/WASM)**: Exposes the core engine to web ecosystems.
- **`usp-js` (JavaScript)**: A lightweight client/server wrapper around the WASM binaries that provides a native, proxy-based Developer Experience (DX) for Node.js backends and browser frontends.

## Granular State Configuration

USP natively understands that not all state is created equal. Instead of rigid scopes or prefixes, state is configured dynamically via an options hash.

```javascript
{
  channel: 'string', // Groups the state logically. Defaults to the variable name.
  password: 'string', // Optional string for securing access to private states.
  access: 'global | server | client', // 'global' (everyone), 'server' (private), 'client' (ephemeral). Defaults to 'global'.
  mode: 'duplex | simplex-server-to-client | simplex-client-to-server | half-duplex' // Sync directionality. Defaults to 'duplex'.
}
```

## Developer Experience (DX)

USP abstracts away the complexity of networking, caching, and state synchronization. You simply define how a variable should behave, and USP handles the rest.

### Frontend Usage

```javascript
import { USPClient } from '@rahuldhole/usp';

const client = new USPClient('http://localhost:3000/api/usp?userId=u123');

// Access state variables by defining their synchronization rules
const globalCounter = client.bindState('counter', { channel: 'my_session' });
const userTheme = client.bindState('theme', { channel: 'my_session_u123' });

// Mutate naturally. USP intercepts this and syncs it!
globalCounter.value++;
userTheme.value = 'dark';
```

### Backend Usage (Node.js)

```javascript
import { USPServer, RedisAdapter } from '@rahuldhole/usp/server';

const adapter = new RedisAdapter('redis://localhost:6379');
const usp = new USPServer(adapter);

// Read state safely without dealing with internal Redis prefixes
const globalCounter = await usp.getState('counter', { channel: 'my_session' });
const newVal = (globalCounter || 0) + 1;

// Mutate state securely. USP will automatically update Redis and broadcast to the right clients!
// Bind state for a specific config and automatically broadcast it
const counter = usp.bindState('counter', { channel: 'my_session' });
await counter.set(await counter.get() + 1);

// Low-level usage
await usp.setState('secret_key', 'super_secret', { channel: 'my_session', access: 'server', password: 'my_pwd' });
```

## Running the Demos

The repository includes a comprehensive `multiserver-js` demo that spins up a Redis instance, an HAProxy load balancer, and 3 backend Node.js workers to demonstrate cross-node synchronization and scope isolation.

1. **Install dependencies**:
   Ensure you have `docker`, `docker-compose`, and `pnpm` installed. Run `pnpm install` in the root.

2. **Start the demo**:
   Run the following task from the root to start the Redis backend and the Node.js workers:
   ```bash
   task multiserver:start
   ```

3. **Explore**:
   Open `http://localhost:3000` in multiple browser tabs. You can use the UI to force your connection to different backend worker nodes, and switch simulated User IDs to see how `user` and `node` state isolation works in real time across the cluster!

## Build from Source

To compile the Rust core into WASM:

```bash
task build:wasm
```

This will automatically build the WASM bundle for the web target and place it in `usp/bindings/js/wasm`.
