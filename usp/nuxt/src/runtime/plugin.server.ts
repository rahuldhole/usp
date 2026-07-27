import { defineNitroPlugin } from 'nitropack/dist/runtime/plugin'
import { USP } from 'usp-js/server'
import { MemoryAdapter } from 'usp-js/adapters/MemoryAdapter'
import { SQLiteAdapter } from 'usp-js/adapters/SQLiteAdapter'
import { RedisAdapter } from 'usp-js/adapters/RedisAdapter'
import { useRuntimeConfig } from '#imports'

export default defineNitroPlugin(async () => {
  const config = useRuntimeConfig().usp || {}
  
  let adapter;
  if (config.adapter === 'sqlite') {
    adapter = new SQLiteAdapter(config.sqlite?.dbPath)
  } else if (config.adapter === 'redis') {
    adapter = new RedisAdapter(config.redis)
  } else {
    adapter = new MemoryAdapter()
  }

  console.log("Starting USP Server with Nuxt Module...");
  await USP.initServer({ adapter });
})
