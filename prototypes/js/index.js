import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createNodeWebSocket } from '@hono/node-ws'
import { createClient } from 'redis'

const app = new Hono()

// Connect to USP State Heap (Redis)
const redisClient = createClient({
  url: 'redis://localhost:6379'
})

redisClient.on('error', (err) => console.log('Redis Client Error', err))
await redisClient.connect()
console.log('Connected to USP State Heap (Redis)')

// Setup WebSocket for Hono
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

// Async Sync Stream
app.get('/ws', upgradeWebSocket((c) => {
  return {
    onMessage(event, ws) {
      try {
        const msg = JSON.parse(event.data.toString())
        
        if (msg.op === 'SET') {
          // 1. Sync diff to heap
          redisClient.hSet(msg.session, `public:${msg.key}`, msg.val)
            .then(() => {
              console.log(`[SYNC] Heap updated: ${msg.key} = ${msg.val} (Session: ${msg.session})`)
            })
            .catch(err => console.error('Failed to sync state:', err))
            
        } else if (msg.op === 'EXEC') {
          // 2. Zero-payload execution trigger
          console.log(`[EXEC] Trigger received: ${msg.action} (Session: ${msg.session})`)
          
          // Server reads state directly from the heap
          redisClient.hGet(msg.session, 'public:user.theme')
            .then(theme => {
              console.log(`>> Executing ${msg.action} with memory state [user.theme=${theme}]`)
              
              // Respond back to client
              ws.send(JSON.stringify({
                status: 'success',
                action: msg.action,
                result: `Processed ${msg.action} with theme: ${theme}`
              }))
            })
            .catch(err => {
              console.error(`Server failed to read state for action ${msg.action}:`, err)
              ws.send(JSON.stringify({ error: 'Failed to read required state', action: msg.action }))
            })
            
        } else {
          console.log(`Unknown operation: ${msg.op}`)
        }
      } catch (err) {
        console.error('Invalid message format', err)
      }
    },
    onClose: () => {
      console.log('Connection closed')
    }
  }
}))

// Static HTML to mock the Client Runtime for easy testing
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
	<h1>USP Client Demo (JS Backend)</h1>
	<p>This mimics a USP client runtime (e.g. JS/Flutter) interacting with the server over WebSockets.</p>
	<button onclick="sendSet()">1. Mutate State (SET user.theme)</button>
	<button onclick="sendExec()">2. Trigger Server Exec (processOrder)</button>
	<br><br>
	<b>Log Stream:</b>
	<pre id="log"></pre>
	
	<script>
		const ws = new WebSocket("ws://" + location.host + "/ws");
		const session = "sess_" + Math.random().toString(36).substr(2, 9);

		ws.onmessage = function(e) {
			document.getElementById('log').innerText += "<- " + e.data + "\\n";
		};
		ws.onopen = function() {
			document.getElementById('log').innerText += "[System] Connected to Async Sync Stream (Session: " + session + ")\\n";
		};

		function sendSet() {
			const msg = {
				op: "SET",
				session: session,
				key: "user.theme",
				val: "dark"
			};
			ws.send(JSON.stringify(msg));
			document.getElementById('log').innerText += "-> " + JSON.stringify(msg) + "\\n";
		}

		function sendExec() {
			const msg = {
				op: "EXEC",
				session: session,
				action: "processOrder"
			};
			ws.send(JSON.stringify(msg));
			document.getElementById('log').innerText += "-> " + JSON.stringify(msg) + "\\n";
		}
	</script>
</body>
</html>
  `)
})

const port = 3000
console.log(`JS prototype server running at http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port
})

injectWebSocket(server)
