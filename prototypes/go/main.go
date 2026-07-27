package main

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"
)

// DeltaFrame represents a state mutation sent to the heap
type DeltaFrame struct {
	Op      string `json:"op"`
	Session string `json:"session"`
	Key     string `json:"key"`
	Val     any    `json:"val"`
}

// ExecTrigger represents a server execution request without payload
type ExecTrigger struct {
	Op      string `json:"op"`
	Session string `json:"session"`
	Action  string `json:"action"`
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

	// 1. Simulate client diff sync
	delta := DeltaFrame{
		Op:      "SET",
		Session: "sess_8f3a9",
		Key:     "user.theme",
		Val:     "dark",
	}
	
	// Write to public domain
	err := rdb.HSet(ctx, delta.Session, "public:"+delta.Key, delta.Val).Err()
	if err != nil {
		log.Fatalf("Failed to sync state: %v", err)
	}
	fmt.Printf("Client synced state: %s = %v\n", delta.Key, delta.Val)

	// 2. Simulate zero-payload exec trigger from client
	trigger := ExecTrigger{
		Op:      "EXEC",
		Session: "sess_8f3a9",
		Action:  "processOrder",
	}

	// 3. Server reads from heap directly upon receiving trigger
	fmt.Printf("Server received EXEC: %s (Session: %s)\n", trigger.Action, trigger.Session)
	
	theme, err := rdb.HGet(ctx, trigger.Session, "public:user.theme").Result()
	if err != nil {
		log.Fatalf("Server failed to read state: %v", err)
	}

	fmt.Printf("Server executed %s with memory state [user.theme=%s]\n", trigger.Action, theme)
}
