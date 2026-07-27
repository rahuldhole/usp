import { USP } from 'usp-js'

export default defineNitroPlugin(async () => {
  console.log("Starting USP Server...");
  await USP.initServer({ dbPath: './usp-state.db' });
})
