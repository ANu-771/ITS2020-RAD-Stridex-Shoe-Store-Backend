import dotenv from "dotenv"
dotenv.config()

import app from "./app"
import { connectDB } from "./config/db"
import { ensureStorageBucketExists } from "./config/supabase"

const PORT = Number(process.env.PORT) || 3000
const HOST = "0.0.0.0"

const startServer = async () => {
  // Start HTTP Server bound to 0.0.0.0 for Cloud Containers (Render)
  const server = app.listen(PORT, HOST, () => {
    console.log(`===============================================`)
    console.log(`🚀 STRIDEX Backend running on http://${HOST}:${PORT}`)
    console.log(`📡 Health check: http://${HOST}:${PORT}/api/health`)
    console.log(`===============================================`)
  })

  // Connect to Database asynchronously
  connectDB().catch((err) => {
    console.error("Database initialization failed:", err)
  })

  // Ensure Supabase Storage bucket is ready asynchronously
  ensureStorageBucketExists().catch((err) => {
    console.warn("Supabase storage initialization warning:", err)
  })

  // Graceful shutdown handling
  const shutdown = () => {
    console.log("\nReceived shutdown signal, terminating gracefully...")
    server.close(() => {
      console.log("STRIDEX server closed.")
      process.exit(0)
    })
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

startServer()

export default app
