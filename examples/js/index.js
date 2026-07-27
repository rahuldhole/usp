import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { USP } from 'usp-js'

const app = new Hono()

// 1. Initialize USP Server Magic!
const server = await USP.initServer({
  redisUrl: 'redis://localhost:6379',
  port: 4000
})

// 2. Register Server Execution Actions
server.registerAction('processOrder', async (session) => {
  // Use the magic proxy to read state directly like a variable!
  const state = USP.useUsp(session);
  const theme = state.userTheme;
  
  console.log(`>> Processing order for session ${session} with theme: ${theme}`);
  return `Successfully processed order in ${theme} mode`;
})


// 3. Setup Hono just to serve our static Test Client
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
	<title>USP Test Client (Magic API)</title>
	<style>
		body { font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; }
		button { margin-right: 1rem; padding: 0.5rem 1rem; cursor: pointer; }
		pre { background: #eee; padding: 1rem; border-radius: 4px; min-height: 200px; }
	</style>
</head>
<body>
	<h1>USP Client Demo (Magic Proxy API)</h1>
	<button onclick="mutateState()">1. Mutate State (state.userTheme = 'dark')</button>
	<button onclick="triggerExec()">2. Trigger Server Exec (processOrder)</button>
	<br><br>
	<b>Log Stream:</b>
	<pre id="log"></pre>
	
	<!-- 
	  We inject the client-side USP code for the browser. 
	  In a real app using a bundler (Webpack/Vite), you would simply:
	  import { USP } from "usp-js"
	  await USP.initClient({ wsUrl: "ws://localhost:4000" })
	  const state = USP.useUsp(session)
	-->
	<script type="module">
	  // Mocking the USP Client for the browser environment without a bundler
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
			  log("<- Server says: " + JSON.stringify(data));
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

	  // Mini Proxy Engine for Browser
	  const globalCache = new Map();
	  let activeClient = null;

	  const USP = {
		async initClient(options) {
		  activeClient = new USPClient(options.wsUrl);
		  activeClient.onRemoteSync = (session, key, val) => {
			if (!globalCache.has(session)) globalCache.set(session, {});
			globalCache.get(session)[key] = val;
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
			  log("-> Syncing: " + prop + " = " + val);
			  activeClient.syncState(session, prop, val);
			  return true;
			}
		  });
		},
		exec(session, action, cb) {
		  log("-> Executing: " + action);
		  activeClient.exec(session, action, cb);
		}
	  };

	  // --- USER CODE START --- //

	  function log(msg) {
		document.getElementById('log').innerText += msg + "\\n";
	  }

	  const mySession = "sess_" + Math.random().toString(36).substr(2, 9);
	  
	  await USP.initClient({ wsUrl: "ws://" + location.hostname + ":4000" });
	  log("[System] USP Client Initialized for session: " + mySession);
	  
	  // Voila! Magic!
	  const sharedState = USP.useUsp(mySession);

	  window.mutateState = () => {
		// Just assigning a variable automatically syncs it via WS to Redis!
		sharedState.userTheme = "dark";
	  };

	  window.triggerExec = () => {
		USP.exec(mySession, 'processOrder', (res) => {
		  log("[Callback] processOrder result: " + JSON.stringify(res.result));
		});
	  };
	</script>
</body>
</html>
  `)
})

const port = 3000
console.log(`Test UI running at http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
