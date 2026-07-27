import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { USPServer } from 'usp-js'

const app = new Hono()

// 1. Initialize USP Server
const usp = new USPServer({
  redisUrl: 'redis://localhost:6379',
  port: 4000
})

// 2. Register Server Execution Actions
usp.registerAction('processOrder', async (session, server) => {
  // Read state directly from heap using the session ID
  const theme = await server.readState(session, 'user.theme');
  console.log(`>> Processing order with theme: ${theme}`);
  return `Successfully processed order in ${theme} mode`;
})

await usp.start()


// 3. Setup Hono just to serve our static Test Client
// Note: In a real app, this would be a separate Next.js/Vite frontend using USPClient.
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
	<title>USP Test Client (JS/Hono)</title>
	<style>
		body { font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; }
		button { margin-right: 1rem; padding: 0.5rem 1rem; cursor: pointer; }
		pre { background: #eee; padding: 1rem; border-radius: 4px; min-height: 200px; }
	</style>
</head>
<body>
	<h1>USP Client Demo (Using usp-js package)</h1>
	<button onclick="sendSet()">1. Mutate State (SET user.theme)</button>
	<button onclick="sendExec()">2. Trigger Server Exec (processOrder)</button>
	<br><br>
	<b>Log Stream:</b>
	<pre id="log"></pre>
	
	<!-- 
	  We inject a lightweight vanilla JS version of USPClient here for the browser demo. 
	  In a real app, you would 'import { USPClient } from "usp-js"' in your build step. 
	-->
	<script>
		class BrowserUSPClient {
			constructor(url) {
				this.url = url;
				this.session = "sess_" + Math.random().toString(36).substr(2, 9);
				this.callbacks = new Map();
			}
			connect() {
				this.ws = new WebSocket(this.url);
				this.ws.onopen = () => log("[System] Connected to USP Sync Stream (Session: " + this.session + ")");
				this.ws.onmessage = (e) => {
					const data = JSON.parse(e.data);
					log("<- " + JSON.stringify(data));
					if (this.callbacks.has(data.action)) {
						this.callbacks.get(data.action)(data);
					}
				};
			}
			setState(key, val) {
				const msg = { op: "SET", session: this.session, key, val };
				this.ws.send(JSON.stringify(msg));
				log("-> " + JSON.stringify(msg));
			}
			exec(action, cb) {
				if (cb) this.callbacks.set(action, cb);
				const msg = { op: "EXEC", session: this.session, action };
				this.ws.send(JSON.stringify(msg));
				log("-> " + JSON.stringify(msg));
			}
		}

		function log(msg) {
			document.getElementById('log').innerText += msg + "\\n";
		}

		const client = new BrowserUSPClient("ws://" + location.hostname + ":4000");
		client.connect();

		function sendSet() {
			client.setState("user.theme", "dark");
		}

		function sendExec() {
			client.exec("processOrder", (res) => {
				log("[Callback] processOrder result: " + JSON.stringify(res.result));
			});
		}
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
