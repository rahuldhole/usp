<script setup>
import { onMounted, reactive, ref } from 'vue';
import { USPClient } from '@rahuldhole/usp';
import initWasm from '@rahuldhole/usp/wasm';
import wasmUrl from '@rahuldhole/usp/wasm/usp_wasm_bg.wasm?url';

const todos = reactive({});
const newTodoText = ref('');
const notice = ref('');
let noticeHandle = null;
let client = null;

onMounted(async () => {
  // Initialize WASM dynamically
  await initWasm(wasmUrl);

  // Connect to the server
  client = new USPClient('http://localhost:3000/api/usp');

  // Get a synced proxy for the "todos" channel
  const stateProxy = client.useUsp('todos', {});
  
  // Bound state for the global notice
  noticeHandle = client.bindState('global_notice', { channel: 'todos', maxSize: 35 });

  // Subscribe to state changes to update our Vue reactive objects
  client.subscribe((globalState) => {
    const data = globalState.todos || {};
    
    // Clear and re-populate the reactive object
    for (const key in todos) {
      delete todos[key];
    }
    
    for (const [id, todo] of Object.entries(data)) {
      if (id === 'visit_counter' || id === 'global_notice') continue;
      todos[id] = todo;
    }
    
    // Update notice
    notice.value = noticeHandle.value || '';
  });
});

function addTodo() {
  const text = newTodoText.value.trim();
  if (!text || !client) return;
  
  const id = 'task_' + Math.random().toString(36).substr(2, 9);
  
  // Create an optimistic update via proxy
  const stateProxy = client.useUsp('todos', {});
  stateProxy[id] = { text, completed: false, timestamp: Date.now() };
  
  newTodoText.value = '';
}

function toggleTodo(id) {
  if (!client) return;
  const stateProxy = client.useUsp('todos', {});
  const current = stateProxy[id];
  if (current) {
    stateProxy[id] = { ...current, completed: !current.completed };
  }
}

function deleteTodo(id) {
  if (!client) return;
  const stateProxy = client.useUsp('todos', {});
  delete stateProxy[id];
}

function clearCompleted() {
  if (!client) return;
  client.dispatchSync({
    op: 'EXEC',
    options: { channel: 'todos' },
    action: 'clearCompleted',
  });
}

function updateNotice() {
  if (!noticeHandle) return;
  try {
    noticeHandle.value = notice.value;
  } catch (err) {
    alert(err.message);
  }
}
</script>

<template>
  <div class="app-wrapper">
    <div class="app-container">
      <header class="app-header">
        <h1>Nuxt + USP</h1>
        <div class="notice-bar">
          <div class="notice-input-wrapper">
            <span class="notice-label">Notice</span>
            <input 
              v-model="notice" 
              @change="updateNotice" 
              placeholder="Enter global notice..."
            />
          </div>
          <button class="btn primary" @click="updateNotice">Broadcast</button>
        </div>
      </header>

      <main class="app-main">
        <div class="add-form">
          <input 
            v-model="newTodoText" 
            @keyup.enter="addTodo" 
            placeholder="What needs to be done?" 
            class="todo-input"
          />
          <button class="btn gradient-btn" @click="addTodo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>

        <TransitionGroup name="list" tag="ul" class="todo-list">
          <li v-for="(todo, id) in todos" :key="id" :class="{ completed: todo.completed }" class="todo-item">
            <div class="todo-content" @click="toggleTodo(id)">
              <div class="checkbox">
                <svg v-if="todo.completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <span class="text">{{ todo.text }}</span>
            </div>
            <button class="btn icon-btn delete-btn" @click.stop="deleteTodo(id)" aria-label="Delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </li>
        </TransitionGroup>

        <div class="footer">
          <button class="btn outline-btn" @click="clearCompleted">
            Clear Completed
          </button>
        </div>
      </main>
    </div>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');

:root {
  --bg-color: #0f172a;
  --glass-bg: rgba(30, 41, 59, 0.7);
  --glass-border: rgba(255, 255, 255, 0.1);
  --primary-glow: rgba(99, 102, 241, 0.5);
  --accent-color: #6366f1;
  --accent-hover: #4f46e5;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --danger: #ef4444;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-color);
  background-image: 
    radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 85% 30%, rgba(168, 85, 247, 0.15) 0%, transparent 50%);
  color: var(--text-main);
  font-family: 'Outfit', sans-serif;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>

<style scoped>
.app-wrapper {
  width: 100%;
  max-width: 600px;
  padding: 2rem 1rem;
}

.app-container {
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  padding: 2.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.app-header {
  text-align: center;
  margin-bottom: 2.5rem;
}

h1 {
  font-weight: 600;
  font-size: 2.5rem;
  margin: 0 0 1.5rem 0;
  background: linear-gradient(135deg, #c084fc, #6366f1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.025em;
}

.notice-bar {
  display: flex;
  gap: 1rem;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
  align-items: center;
}

.notice-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 0.5rem 1rem;
}

.notice-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--accent-color);
  margin-right: 0.75rem;
  letter-spacing: 0.05em;
}

.notice-input-wrapper input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.9rem;
  outline: none;
}

.notice-input-wrapper input::placeholder {
  color: var(--text-muted);
}

.add-form {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.todo-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 1rem 1.5rem;
  font-size: 1.1rem;
  color: var(--text-main);
  font-family: inherit;
  transition: all 0.3s ease;
  outline: none;
}

.todo-input:focus {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--accent-color);
  box-shadow: 0 0 0 4px var(--primary-glow);
}

.todo-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.todo-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.todo-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 1rem;
  transition: all 0.2s ease;
}

.todo-item:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-2px);
}

.todo-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  cursor: pointer;
}

.checkbox {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 2px solid var(--accent-color);
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s ease;
}

.todo-item.completed .checkbox {
  background: var(--accent-color);
}

.todo-item .text {
  font-size: 1.1rem;
  transition: all 0.2s ease;
}

.todo-item.completed .text {
  text-decoration: line-through;
  color: var(--text-muted);
}

.btn {
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn.primary {
  background: var(--accent-color);
  color: white;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.gradient-btn {
  background: linear-gradient(135deg, #c084fc, #6366f1);
  color: white;
  border-radius: 16px;
  padding: 0 1.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
}

.gradient-btn:hover {
  filter: brightness(1.1);
  transform: scale(1.05);
}

.gradient-btn:active {
  transform: scale(0.95);
}

.icon-btn {
  background: transparent;
  color: var(--text-muted);
  padding: 0.5rem;
  border-radius: 8px;
}

.icon-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
}

.outline-btn {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--glass-border);
}

.outline-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-main);
}

.footer {
  margin-top: 2rem;
  display: flex;
  justify-content: flex-end;
  padding-top: 1.5rem;
  border-top: 1px solid var(--glass-border);
}

/* Animations */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.list-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
