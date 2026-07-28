import { USPClient } from '/usp-sdk/src/client.js';
import initWasm from '/usp-sdk/wasm/usp_wasm.js';

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
    
    // 3. Simulated User Authentication
    let userId = localStorage.getItem('demo_user_id');
    if (!userId) {
        userId = 'u' + Math.floor(Math.random() * 10000);
        localStorage.setItem('demo_user_id', userId);
    }
    document.getElementById('user-id-display').textContent = userId;

    const client = new USPClient(window.location.origin + `/api/usp?userId=${userId}`);
    
    // 4. Connect to "cluster_demo" session with different state scopes
    const globalState = client.useUsp('cluster_demo'); 
    const channelState = client.useUsp('cluster_demo', { scope: 'channel' });
    const userState = client.useUsp('cluster_demo', { scope: 'user' });
    const nodeState = client.useUsp('cluster_demo', { scope: 'node' });
    
    // 5. User Switcher Handlers
    const switchUser = (id) => {
        localStorage.setItem('demo_user_id', id);
        window.location.reload();
    };
    document.getElementById('btn-u1').onclick = () => switchUser('u1');
    document.getElementById('btn-u2').onclick = () => switchUser('u2');
    document.getElementById('btn-u3').onclick = () => switchUser('u3');

    // UI Elements
    const globalEl = document.getElementById('global-counter-val');
    const channelEl = document.getElementById('channel-counter-val');
    const userEl = document.getElementById('user-counter-val');
    const nodeEl = document.getElementById('node-counter-val');
    
    // Render loop triggered on state changes
    client.subscribe((states) => {
        globalEl.textContent = states.global?.counter ?? 0;
        channelEl.textContent = states.channel?.counter ?? 0;
        userEl.textContent = states.user?.counter ?? 0;
        nodeEl.textContent = states.node?.counter ?? 0;
    });

    // Global
    document.getElementById('global-inc-btn').onclick = () => globalState.counter = (globalState.counter || 0) + 1;
    document.getElementById('global-dec-btn').onclick = () => globalState.counter = (globalState.counter || 0) - 1;

    // Channel
    document.getElementById('channel-inc-btn').onclick = () => channelState.counter = (channelState.counter || 0) + 1;
    document.getElementById('channel-dec-btn').onclick = () => channelState.counter = (channelState.counter || 0) - 1;

    // User
    document.getElementById('user-inc-btn').onclick = () => userState.counter = (userState.counter || 0) + 1;
    document.getElementById('user-dec-btn').onclick = () => userState.counter = (userState.counter || 0) - 1;

    // Probe Private
    document.getElementById('probe-btn').onclick = () => {
        // Private state isn't part of any client proxy, we try reading from global just to test
        const secret = globalState['private:secret'];
        if (secret) {
            document.getElementById('probe-result').textContent = `SUCCESS: ${secret} (This shouldn't happen!)`;
            document.getElementById('probe-result').style.color = "green";
        } else {
            document.getElementById('probe-result').textContent = `FAILED: private state is inaccessible on client.`;
            document.getElementById('probe-result').style.color = "red";
        }
    };
}

main().catch(console.error);
