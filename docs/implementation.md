# Implementation Guide

## Unified State Protocol (USP) Core Engine Architecture

This document specifies the target architecture, compilation targets, interface layer, and distribution model for the **Unified State Protocol (USP)** reference core implementation (`usp-core`).

---

## 1. Core Architectural Strategy

To avoid rewriting protocol state machine logic across multiple programming languages (JavaScript, TypeScript, Python, Go, Rust, Swift, C++), the entire protocol logic is implemented **once in Rust**.

The compiled binary targets two runtime interfaces:

1. **WebAssembly (WASM):** For Web Browsers, Node.js, Bun, V8 Isolates, and Edge Workers (Cloudflare, Vercel, Fastly).
2. **C-ABI Shared Libraries (`repr(C)` / FFI):** For native backend environments (Go, Python, C++, Java) and mobile runtimes (iOS/Swift, Android/Kotlin).

```
                                  ┌───────────────────────────┐
                                  │      `usp-core` Rust      │
                                  │   (Pure Protocol Logic)   │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 │ Compilation Layer                                           │
                 ▼                                                             ▼
  ┌─────────────────────────────┐                               ┌─────────────────────────────┐
  │   `wasm-bindgen` Target     │                               │  `repr(C)` / C-ABI Target   │
  │   wasm32-unknown-unknown    │                               │  Static/Dynamic Native Lib  │
  └──────────────┬──────────────┘                               └──────────────┬──────────────┘
                 │                                                             │
                 ▼                                                             ▼
  ┌─────────────────────────────┐                               ┌─────────────────────────────┐
  │ JavaScript / TypeScript     │                               │ Foreign Language Bindings   │
  │ - Browser WebSockets        │                               │ - Go (cgo)                  │
  │ - Node.js / Bun             │                               │ - Python (cffi / PyO3)      │
  │ - Cloudflare Workers / Edge │                               │ - Swift (C-Interop)         │
  └─────────────────────────────┘                               └─────────────────────────────┘
```

---

## 2. Directory & Workspace Structure

```
usp-protocol/
├── Cargo.toml                    # Cargo workspace definition
├── crates/
│   ├── usp-core/                 # PURE PROTOCOL ENGINE (No I/O, no network)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── state.rs          # Mutation parser & state diff engine
│   │       ├── session.rs        # Ephemeral TTL & session lifecycle rules
│   │       ├── security.rs       # Dual-namespace boundary logic (public vs private)
│   │       └── lib.rs
│   │
│   ├── usp-wasm/                 # WASM INTERFACE BINDINGS
│   │   ├── Cargo.toml            # Configured with crate-type = ["cdylib"]
│   │   └── src/                  # Exposes wasm-bindgen decorators & WIT contracts
│   │
│   └── usp-ffi/                  # NATIVE C-ABI BINDINGS
│       ├── Cargo.toml            # Configured with crate-type = ["cdylib", "staticlib"]
│       └── src/                  # Exposes extern "C" functions & C-compatible structs
│
├── bindings/                     # AUTO-GENERATED LANGUAGE SDKs
│   ├── js/                       # npm package (WASM wrapper + Proxy layer)
│   ├── python/                   # PyPI wheel (C-FFI wrapper)
│   └── go/                       # Go module (cgo bindings)
│
└── IMPLEMENTATION.md
```

---

## 3. Protocol Boundaries & Responsibilities

### Included in `usp-core` (The Rust Engine)

* **Diff Engine:** Parsing and generating mutation operations (`SET`, `DELETE`, `MERGE`).
* **Security Validation:** Rejecting client-initiated writes to the `private` namespace.
* **Session Verification:** Validating session hashes and sequence counters.
* **Serialization/Deserialization:** Processing low-latency binary (MessagePack/Protobuf) or JSON protocol frames.

### Excluded from `usp-core` (Delegated to Host Runtimes)

* **Network I/O:** The Rust core does not open TCP sockets or WebSocket connections directly. The host runtime (JS, Go, Python) passes raw incoming bytes/text into `usp-core` and receives outbound bytes to transmit over the network.
* **Redis Driver Communication:** The host worker handles physical TCP network connections to Redis; `usp-core` generates the command parameters (e.g., `HSET session:123 key val`).

---

## 4. Compilation & Build Targets

### A. WebAssembly Build Target

For browser, Node.js, and edge deployments:

* **Target Triple:** `wasm32-unknown-unknown`
* **Toolchain:** `wasm-pack` / `cargo-component`
* **Output Artifacts:**
  * `usp_core_bg.wasm` (Compiled WebAssembly binary)
  * `usp_core.js` (Auto-generated ES module bindings)

### B. Native Shared Library Target

For native server backends and mobile SDKs:

* **Target Triples:** `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`
* **Crate Types:** `cdylib` (`.so`, `.dylib`, `.dll`) and `staticlib` (`.a`)
* **Header Generation:** `cbindgen` auto-generates `usp.h` for C/C++ inclusion.

---

## 5. Foreign Language Bindings Strategy

| Language Environment | Integration Mechanism | Deployment Strategy |
| --- | --- | --- |
| **Browser JS / TS** | WebAssembly (`wasm-bindgen`) | Published to `npm` as `@usp/client` |
| **Edge Workers (Cloudflare/Vercel)** | V8 WASM Isolate Import | Bundled into edge worker builds |
| **Go** | `cgo` linking to `libusp.a` static lib | Published as `github.com/usp-protocol/usp-go` |
| **Python** | PyO3 / CFFI wrapper around `libusp.so` | Published to PyPI as `usp-python` |
| **Swift / iOS** | Swift Package Manager + C-ABI Header | Xcode Framework wrapper |

---

## 6. Execution Lifecycle Sequence

```
[Client Runtime (JS/Swift)]
   │
   ├── 1. Developer mutates variable (state.x = 10)
   ├── 2. Proxy trap intercepts assignment
   ├── 3. Passes value to local WASM/FFI engine instance
   │
[usp-core WASM Engine]
   │
   ├── 4. Validates key permissions (Ensure namespace != "private")
   ├── 5. Serializes mutation frame: { "op": "SET", "key": "x", "val": 10 }
   │
[Host Transport]
   │
   ├── 6. WebSocket streams frame over network to Edge Worker
   │
[Server Edge Worker]
   │
   ├── 7. Server passes raw frame to its own `usp-core` WASM instance
   ├── 8. `usp-core` validates session TTL & outputs Redis command
   └── 9. Edge Worker executes `HSET session:123 x 10` in Redis RAM
```

---

## 7. Development & Release Workflow

1. **Modify Protocol Rules:** Changes are made **strictly** inside `crates/usp-core/`.
2. **Execute Core Test Suite:** Run `cargo test` (unit testing for diffing, security rules, session validation).
3. **Build Target Libraries:**
   * `cargo build --target wasm32-unknown-unknown --release`
   * `cbindgen --config cbindgen.toml --crate usp-ffi --output bindings/c/usp.h`
4. **Distribute Bindings:** CI/CD pipeline compiles WASM/Native binaries and publishes native package updates to `npm`, `PyPI`, and `crates.io` in parallel.
