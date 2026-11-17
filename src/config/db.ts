import mongoose from "mongoose"
import dns from "node:dns"
import fs from "fs"
import path from "path"

export const connectDB = async (): Promise<void> => {
  let mongoUrl =
    process.env.MONGODB_URI ||
    process.env.MONGO_ATLAS_URL ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL ||
    ""

  // If not found in process.env, inspect .env file directly for local development
  if (!mongoUrl) {
    try {
      const envPath = path.resolve(__dirname, "../../.env")
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8")
        const match = envContent.match(/(?:MONGO_ATLAS_URL|MONGODB_URI|MONGO_URI)\s*=\s*([^\r\n]+)/)
        if (match && match[1]) {
          mongoUrl = match[1].trim()
        }
      }
    } catch {
      // Fallback silently if filesystem read is restricted
    }
  }

  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true" ||
    !!process.env.RENDER_SERVICE_ID

  // In production (Render/Cloud), strictly prevent accidental localhost fallback
  if (!mongoUrl) {
    if (isProduction) {
      console.error("==================================================================")
      console.error("❌ [CRITICAL RENDER CONFIG ERROR] MongoDB connection URI is missing!")
      console.error("Render cannot connect to MongoDB because no Atlas URI is configured.")
      console.error("👉 ACTION REQUIRED IN RENDER DASHBOARD:")
      console.error("   1. Go to your Render Web Service dashboard -> 'Environment'")
      console.error("   2. Add Key: MONGODB_URI (or MONGO_ATLAS_URL)")
      console.error("   3. Add Value: mongodb+srv://<username>:<password>@cluster0.sapfsd8.mongodb.net/stridex_db?retryWrites=true&w=majority")
      console.error("   4. In MongoDB Atlas -> Network Access, ensure 0.0.0.0/0 is active.")
      console.error("==================================================================")
      return
    }
    // Local development only fallback
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
