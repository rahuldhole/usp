import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { USP } from 'usp-js'

const app = new Hono()

// 1. Initialize USP Server Magic!
const server = await USP.initServer({
  redisUrl: 'redis://localhost:6379',
  port: 4000
})

// Provide a quick way to fetch the initial state when a client connects
server.registerAction('getState', async (session) => {
  const state = USP.useUsp(session);
  // State is fetched from Redis (which returns strings)
  return state.todos || '[]';
})


// 2. Setup Hono just to serve our static Test Client
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
	<title>USP Todo App</title>
	<style>
		body { font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; background: #fafafa; }
		.card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
		input { padding: 0.5rem; width: 60%; margin-right: 1rem; border: 1px solid #ccc; border-radius: 4px; }
		button { padding: 0.5rem 1rem; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px; }
		button:hover { background: #0056b3; }
		ul { list-style: none; padding: 0; margin-top: 2rem; }
		li { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #eee; }
		.actions button { padding: 0.2rem 0.5rem; font-size: 0.8rem; margin-left: 0.5rem; }
		.actions .delete { background: #dc3545; }
		.actions .delete:hover { background: #c82333; }
		.done { text-decoration: line-through; color: #888; }
	</style>
</head>
<body>
	<div class="card">
		<h1>Realtime USP Todos</h1>
		<p>Open this page in multiple tabs to see state magically sync across clients!</p>
		
		<div>
			<input id="todoInput" placeholder="What needs to be done?" onkeypress="if(event.key === 'Enter') window.addTodo()" />
			<button onclick="window.addTodo()">Add Todo</button>
		</div>

		<ul id="todoList"></ul>
	</div>
	
	<!-- Mock USP Client for Browser -->
	<script type="module">
	  class USPClient {
		constructor(url) {
		  this.url = url;
		  this.callbacks = new Map();
		  this.onRemoteSync = null;
		}
		async connect() {
		  return new Promise((resolve) => {
			this.ws = new WebSocket(this.url);
			this.ws.onopen = () => resolve();
			this.ws.onmessage = (e) => {
			  const data = JSON.parse(e.data);
			  if (data.op === 'SET' && this.onRemoteSync) {
				this.onRemoteSync(data.session, data.key, data.val);
			  } else if (data.action && this.callbacks.has(data.action)) {
				this.callbacks.get(data.action)(data);
			  }
			};
		  });
		}
		syncState(session, key, value) {
		  this.ws.send(JSON.stringify({ op: "SET", session, key, val: value }));
		}
		exec(session, action, cb) {
		  if (cb) this.callbacks.set(action, cb);
		  this.ws.send(JSON.stringify({ op: "EXEC", session, action }));
		}
	  }

	  const globalCache = new Map();
	  let activeClient = null;

	  const USP = {
		async initClient(options) {
		  activeClient = new USPClient(options.wsUrl);
		  activeClient.onRemoteSync = (session, key, val) => {
			if (!globalCache.has(session)) globalCache.set(session, {});
			globalCache.get(session)[key] = val;
			
			// Quick hack to trigger re-renders in our vanilla JS app
			if (window.onUspSync) window.onUspSync(key, val);
		  };
		  await activeClient.connect();
		},
		useUsp(session) {
		  if (!globalCache.has(session)) globalCache.set(session, {});
		  const target = globalCache.get(session);
		  
		  return new Proxy(target, {
			get(obj, prop) {
			  return obj[prop];
			},
			set(obj, prop, val) {
			  obj[prop] = val;
			  activeClient.syncState(session, prop, val);
			  return true;
			}
		  });
		},
		exec(session, action, cb) {
		  activeClient.exec(session, action, cb);
		}
	  };


	  // --- TODO APP CODE --- //

	  // Use a global session so all tabs share the exact same Todo list!
	  const sharedSession = "global_todos_session";
	  
	  await USP.initClient({ wsUrl: "ws://" + location.hostname + ":4000" });
	  const sharedState = USP.useUsp(sharedSession);

	  let localTodos = [];

	  function renderTodos() {
		const list = document.getElementById('todoList');
		list.innerHTML = '';
		localTodos.forEach((todo, idx) => {
		  const li = document.createElement('li');
		  
		  const span = document.createElement('span');
		  span.innerText = todo.text;
		  if (todo.done) span.className = 'done';
		  
		  const actions = document.createElement('div');
		  actions.className = 'actions';
		  
		  const toggleBtn = document.createElement('button');
		  toggleBtn.innerText = todo.done ? 'Undo' : 'Done';
		  toggleBtn.onclick = () => window.toggleTodo(idx);
		  
		  const deleteBtn = document.createElement('button');
		  deleteBtn.innerText = 'Delete';
		  deleteBtn.className = 'delete';
		  deleteBtn.onclick = () => window.deleteTodo(idx);
		  
		  actions.appendChild(toggleBtn);
		  actions.appendChild(deleteBtn);
		  
		  li.appendChild(span);
		  li.appendChild(actions);
		  list.appendChild(li);
		});
	  }

	  // Update the magic state and trigger a render
	  function saveTodos() {
		// Assigning automatically writes to Redis and broadcasts to all tabs!
		sharedState.todos = JSON.stringify(localTodos);
		renderTodos();
	  }

	  // Listen for background updates from other tabs
	  window.onUspSync = (key, val) => {
		if (key === 'todos') {
		  localTodos = JSON.parse(val || '[]');
		  renderTodos();
		}
	  };

	  // Initial Data Fetch
	  USP.exec(sharedSession, 'getState', (res) => {
		localTodos = JSON.parse(res.result || '[]');
		renderTodos();
	  });

	  // --- UI ACTIONS --- //

	  window.addTodo = () => {
		const input = document.getElementById('todoInput');
		const text = input.value.trim();
		if (!text) return;
		
		localTodos.push({ text, done: false });
		saveTodos();
		input.value = '';
	  };

	  window.toggleTodo = (idx) => {
		localTodos[idx].done = !localTodos[idx].done;
		saveTodos();
	  };

	  window.deleteTodo = (idx) => {
		localTodos.splice(idx, 1);
		saveTodos();
	  };

	</script>
</body>
</html>
  `)
})

const port = 3000
console.log(`Todo App UI running at http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
