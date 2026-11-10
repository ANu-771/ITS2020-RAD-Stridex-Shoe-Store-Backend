import dns from "node:dns"
dns.setServers(["8.8.8.8"])

import express, { type Request, type Response } from "express"
import AuthRouter from "./routes/auth.routers"
import mongoose from "mongoose"
import dotenv from "dotenv"
import cors from "cors"
import path from "path"
dotenv.config()

const MONGO_URL =
  process.env.MONGO_ATLAS_URL || process.env.MONGO_LOCAL_URL || ""
const PORT = process.env.PORT || 3000

const app = express()


app.use(cors())
app.use(express.json())
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

app.use("/api/v1/auth", AuthRouter)

mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("DB connected..!")

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`)
    })
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Fail to connect DB: ${message}`)
  })
