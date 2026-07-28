import { USPClient } from '/usp-sdk/dist/client.js';
import initWasm from '/usp-sdk/wasm/usp_wasm.js';

async function main() {
    // 1. Initialize WASM Protocol Engine
    await initWasm('/usp-sdk/wasm/usp_wasm_bg.wasm');

    // 2. Initialize USP Client Transport
    const client = new USPClient('http://localhost:3000/api/usp');
    
    // 3. Connect to "todos" session and get Proxy
    const state = client.useUsp('todos', {});
    
    // UI Elements
    const listEl = document.getElementById('todo-list');
    const inputEl = document.getElementById('todo-input');
    const addBtn = document.getElementById('add-btn');
    const clearBtn = document.getElementById('clear-btn');

    // Render loop triggered on state changes
    client.subscribe((latestState) => {
        listEl.innerHTML = '';
        Object.entries(latestState).forEach(([id, todo]) => {
            if (id === 'visit_counter' || id === 'global_notice') return; // Skip counter and notice state

            const li = document.createElement('li');
            
            const span = document.createElement('span');
            span.textContent = todo.text;
            if (todo.completed) span.className = 'completed';
            
            const controls = document.createElement('div');
            
            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = todo.completed ? 'Undo' : 'Complete';
            toggleBtn.onclick = () => {
                // Modifying state natively through proxy triggers Sync!
                state[id] = { ...todo, completed: !todo.completed };
            };
            
            const delBtn = document.createElement('button');
            delBtn.textContent = '❌';
            delBtn.className = 'danger';
            delBtn.onclick = () => {
                // Deleting property triggers Sync!
                delete state[id];
            };

            controls.appendChild(toggleBtn);
            controls.appendChild(delBtn);
            
            li.appendChild(span);
            li.appendChild(controls);
            listEl.appendChild(li);
        });
    });

    // Add new Todo
    addBtn.onclick = () => {
        const text = inputEl.value.trim();
        if (!text) return;
        
        const id = 'task_' + Math.random().toString(36).substr(2, 9);
        
        // Proxy assignment intercept -> Rust engine -> Network -> Database!
        state[id] = { text, completed: false };
        
        inputEl.value = '';
    };

    // Server-side action
    clearBtn.onclick = () => {
        client.dispatchSync({
            op: 'EXEC',
            session: 'todos',
            action: 'clearCompleted'
        });
    };

    // --- COUNTER EXAMPLE ---
    
    // Use the existing 'state' (which is the 'todos' session proxy)
    const counterValEl = document.getElementById('counter-val');
    const incBtn = document.getElementById('inc-btn');
    const decBtn = document.getElementById('dec-btn');

    // We can piggyback on the same render loop or add another subscriber
    client.subscribe((latestState) => {
        counterValEl.textContent = latestState.visit_counter ?? 0;
    });

    incBtn.onclick = () => {
        state.visit_counter = (state.visit_counter || 0) + 1;
    };
    
    decBtn.onclick = () => {
        state.visit_counter = (state.visit_counter || 0) - 1;
    };

    // --- GLOBAL NOTICE BOARD EXAMPLE (maxSize Validation) ---
    const noticeState = client.bindState('global_notice', { channel: 'todos', maxSize: 35 });
    const noticeValEl = document.getElementById('notice-val');
    const noticeInputEl = document.getElementById('notice-input');
    const noticeBtn = document.getElementById('notice-btn');
    const noticeErrorEl = document.getElementById('notice-error');

    client.subscribe((latestState) => {
        if (latestState.global_notice !== undefined) {
            noticeValEl.textContent = latestState.global_notice;
        }
    });

    noticeBtn.onclick = () => {
        const text = noticeInputEl.value;
        noticeErrorEl.textContent = '';
        try {
            // Attempting to set an oversized payload (> 35 bytes) will trigger USP validation exception!
            noticeState.value = text;
            noticeInputEl.value = '';
            noticeErrorEl.style.color = '#28a745';
            noticeErrorEl.textContent = '✅ Notice broadcasted successfully!';
            setTimeout(() => { if (noticeErrorEl.textContent && noticeErrorEl.textContent.startsWith('✅')) noticeErrorEl.textContent = ''; }, 3000);
        } catch (err) {
            console.error("USP State Error:", err);
            noticeErrorEl.style.color = '#d9534f';
            noticeErrorEl.textContent = `🚫 ${err.message || err}`;
        }
    };
}

main().catch(console.error);
