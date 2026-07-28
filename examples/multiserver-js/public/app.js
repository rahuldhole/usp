import { USPClient, initWasm } from '/usp-sdk/src/index.js';

async function main() {
    // Determine which node we hit (just for display)
    try {
        const res = await fetch('/api/node-id');
        const data = await res.json();
        document.getElementById('node-id').textContent = `Port ${data.port}`;
    } catch (e) {
        document.getElementById('node-id').textContent = `Unknown`;
    }

    // 1. Initialize WASM Protocol Engine
    await initWasm('/usp-sdk/wasm/usp_wasm_bg.wasm');

    // 2. Initialize USP Client Transport
    // We connect to the load balancer (port 3000), which proxies to 3001/3002/3003
    const client = new USPClient(window.location.origin + '/api/usp');
    
    // 3. Connect to "cluster_demo" session and get Proxy
    const state = client.useUsp('cluster_demo', {});
    
    const counterValEl = document.getElementById('counter-val');
    const incBtn = document.getElementById('inc-btn');
    const decBtn = document.getElementById('dec-btn');

    // Render loop triggered on state changes
    client.subscribe((latestState) => {
        counterValEl.textContent = latestState.counter ?? 0;
    });

    incBtn.onclick = () => {
        state.counter = (state.counter || 0) + 1;
    };
    
    decBtn.onclick = () => {
        state.counter = (state.counter || 0) - 1;
    };
}

main().catch(console.error);
