import { fork } from 'child_process';
import httpProxy from 'http-proxy';
import http from 'http';

const WORKER_PORTS = [3001, 3002, 3003];
const PROXY_PORT = 3000;

// Start Workers
console.log("Starting backend USP nodes...");
WORKER_PORTS.forEach(port => {
    fork('./worker.js', [], { env: { ...process.env, PORT: port } });
});

// Start Proxy (Load Balancer)
const proxy = httpProxy.createProxyServer({});

let currentWorker = 0;

const server = http.createServer((req, res) => {
    // Basic Round-Robin Load Balancing
    const target = `http://127.0.0.1:${WORKER_PORTS[currentWorker]}`;
    
    // Set a header to prove which node we hit (useful for testing)
    res.setHeader('X-Backend-Node', WORKER_PORTS[currentWorker]);
    
    proxy.web(req, res, { target }, (err) => {
        console.error("Proxy error:", err);
        res.writeHead(502);
        res.end("Bad Gateway");
    });

    currentWorker = (currentWorker + 1) % WORKER_PORTS.length;
});

server.listen(PROXY_PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 Multiserver USP Proxy listening on http://localhost:${PROXY_PORT}`);
    console.log(`⚖️  Load balancing traffic across ports: ${WORKER_PORTS.join(', ')}`);
    console.log(`========================================\n`);
});
