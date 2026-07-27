package main

import (
	"context"
	"fmt"
	"log"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// USPMessage handles both Delta frames (SET) and Execution Triggers (EXEC)
type USPMessage struct {
	Op      string `json:"op"`
	Session string `json:"session"`
	Key     string `json:"key,omitempty"`
	Val     any    `json:"val,omitempty"`
	Action  string `json:"action,omitempty"`
}

func main() {
	ctx := context.Background()
	
	// Connect to USP State Heap (Redis)
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis heap: %v", err)
	}
	fmt.Println("Connected to USP State Heap")

	app := fiber.New()

	// WebSocket upgrade middleware
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	// Async Sync Stream
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		for {
			var msg USPMessage
			if err := c.ReadJSON(&msg); err != nil {
				log.Println("ws read err:", err)
				break
			}

			switch msg.Op {
			case "SET":
				// 1. Sync diff to heap
				err := rdb.HSet(ctx, msg.Session, "public:"+msg.Key, msg.Val).Err()
				if err != nil {
					log.Printf("Failed to sync state: %v\n", err)
					continue
				}
				fmt.Printf("[SYNC] Heap updated: %s = %v (Session: %s)\n", msg.Key, msg.Val, msg.Session)

			case "EXEC":
				// 2. Zero-payload execution trigger
				fmt.Printf("[EXEC] Trigger received: %s (Session: %s)\n", msg.Action, msg.Session)
				
				// Server reads state directly from the heap
				theme, err := rdb.HGet(ctx, msg.Session, "public:user.theme").Result()
				if err != nil {
					log.Printf("Server failed to read state for action %s: %v\n", msg.Action, err)
					
					c.WriteJSON(map[string]interface{}{
						"error": "Failed to read required state",
						"action": msg.Action,
					})
					continue
				}
				
				fmt.Printf(">> Executing %s with memory state [user.theme=%s]\n", msg.Action, theme)
				
				// Respond back to client
				response := map[string]interface{}{
					"status": "success",
					"action": msg.Action,
					"result": fmt.Sprintf("Processed %s with theme: %s", msg.Action, theme),
				}
				c.WriteJSON(response)

			default:
				log.Printf("Unknown operation: %s\n", msg.Op)
			}
		}
	}))

	// Static HTML to mock the Client Runtime for easy testing
	app.Get("/", func(c *fiber.Ctx) error {
		c.Type("html")
		return c.SendString(`
<!DOCTYPE html>
<html>
<head>
	<title>USP Test Client</title>
	<style>
		body { font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; }
		button { margin-right: 1rem; padding: 0.5rem 1rem; cursor: pointer; }
		pre { background: #eee; padding: 1rem; border-radius: 4px; min-height: 200px; }
	</style>
</head>
<body>
	<h1>USP Client Demo</h1>
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
			document.getElementById('log').innerText += "<- " + e.data + "\n";
		};
		ws.onopen = function() {
			document.getElementById('log').innerText += "[System] Connected to Async Sync Stream (Session: " + session + ")\n";
		};

		function sendSet() {
			const msg = {
				op: "SET",
				session: session,
				key: "user.theme",
				val: "dark"
			};
			ws.send(JSON.stringify(msg));
			document.getElementById('log').innerText += "-> " + JSON.stringify(msg) + "\n";
		}

		function sendExec() {
			const msg = {
				op: "EXEC",
				session: session,
				action: "processOrder"
			};
			ws.send(JSON.stringify(msg));
			document.getElementById('log').innerText += "-> " + JSON.stringify(msg) + "\n";
		}
	</script>
</body>
</html>
		`)
	})

	fmt.Println("Server running at http://localhost:3000")
	log.Fatal(app.Listen(":3000"))
}
