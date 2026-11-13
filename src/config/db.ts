import mongoose from "mongoose"
import dns from "node:dns"
import fs from "fs"
import path from "path"

export const connectDB = async (): Promise<void> => {
  let mongoUrl =
    process.env.MONGODB_URI ||
    process.env.MONGO_ATLAS_URL ||
    ""

  // If not found in process.env, inspect .env file directly for any Atlas URI without modifying the file
  if (!mongoUrl) {
    try {
      const envPath = path.resolve(__dirname, "../../.env")
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8")
        const atlasMatch = envContent.match(/MONGO_ATLAS_URL\s*=\s*([^\r\n]+)/)
        if (atlasMatch && atlasMatch[1]) {
          mongoUrl = atlasMatch[1].trim()
        }
      }
    } catch {
      // Fallback silently if filesystem read is restricted
    }
  }

  // Fallback to local MongoDB URL if Atlas is not defined
  if (!mongoUrl) {
    mongoUrl = process.env.MONGO_LOCAL_URL || "mongodb://localhost:27017/stridex_db"
  }

  // Ensure DNS is configured for MongoDB Atlas SRV lookup
  if (mongoUrl.startsWith("mongodb+srv://")) {
    try {
      dns.setServers(["8.8.8.8", "8.8.4.4"])
    } catch {
      // Ignore if DNS override not permitted
    }
  }

  try {
    // Sanitize URL for safe logging (never expose password in logs)
    const sanitizedUrl = mongoUrl.replace(/:\/\/(.*?):(.*?)@/, "://$1:****@")
    console.log(`Connecting to database: ${sanitizedUrl}...`)

    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 5000,
    })

    const dbName = mongoose.connection.name || "database"
    console.log(`✅ MongoDB connected successfully to: ${dbName}`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ MongoDB connection failed: ${message}`)
  }
}
