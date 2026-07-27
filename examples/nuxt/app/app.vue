<template>
  <div class="card">
    <h1>USP + Nuxt 3</h1>
    <p>State magically syncs across Nuxt clients!</p>
    
    <div>
      <input 
        v-model="newTodo" 
        placeholder="What needs to be done?" 
        @keyup.enter="addTodo" 
      />
      <button @click="addTodo">Add Todo</button>
    </div>

    <ul>
      <li v-for="(todo, idx) in localTodos" :key="idx">
        <span :class="{ done: todo.done }">{{ todo.text }}</span>
        <div class="actions">
          <button @click="toggleTodo(idx)">
            {{ todo.done ? 'Undo' : 'Done' }}
          </button>
          <button class="delete" @click="deleteTodo(idx)">Delete</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const localTodos = ref([]);
const newTodo = ref('');
let sharedState = null;

onMounted(async () => {
  // 1. Connect — uses SSE + HTTP POST, no WebSocket needed
  await USP.initClient();

  // 2. One magic variable — shared state, synced everywhere
  sharedState = USP.useUsp("todos");

  // 3. React to remote changes (other tabs / clients)
  USP.onSync((session, key) => {
    if (key === 'todos') {
      localTodos.value = JSON.parse(sharedState.todos || '[]');
    }
  });
});

function saveTodos() {
  if (sharedState) {
    // One assignment = persists to SQLite + broadcasts to all clients via SSE
    sharedState.todos = JSON.stringify(localTodos.value);
  }
}

function addTodo() {
  const text = newTodo.value.trim();
  if (!text) return;
  localTodos.value.push({ text, done: false });
  saveTodos();
  newTodo.value = '';
}

function toggleTodo(idx) {
  localTodos.value[idx].done = !localTodos.value[idx].done;
  saveTodos();
}

function deleteTodo(idx) {
  localTodos.value.splice(idx, 1);
  saveTodos();
}
</script>

<style>
body { font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; background: #fafafa; }
.card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
input { padding: 0.5rem; width: 60%; margin-right: 1rem; border: 1px solid #ccc; border-radius: 4px; }
button { padding: 0.5rem 1rem; cursor: pointer; background: #00dc82; color: white; border: none; border-radius: 4px; font-weight: bold; }
button:hover { background: #00c572; }
ul { list-style: none; padding: 0; margin-top: 2rem; }
li { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #eee; }
.actions button { padding: 0.2rem 0.5rem; font-size: 0.8rem; margin-left: 0.5rem; }
.actions .delete { background: #dc3545; }
.actions .delete:hover { background: #c82333; }
.done { text-decoration: line-through; color: #888; }
</style>
