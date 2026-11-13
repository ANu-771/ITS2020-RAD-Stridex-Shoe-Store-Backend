import express, { Application, Request, Response } from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import path from "path"
import AuthRouter from "./routes/auth.routers"
import { errorHandler, notFoundHandler } from "./middleware/error"

const app: Application = express()

// Global Middlewares
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:4173",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:4173",
    ],
    credentials: true,
  })
)
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Static file serving for uploads
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "STRIDEX Backend API",
    version: "2.0.0",
    database: "MongoDB Atlas",
    timestamp: new Date().toISOString(),
  })
})

// Base API route
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    message: "Welcome to STRIDEX E-Commerce API",
    version: "2.0.0",
    docs: "/api/health",
  })
})

// Feature Routes
app.use("/api/v1/auth", AuthRouter)

// 404 & Centralized Error Handlers
app.use(notFoundHandler)
app.use(errorHandler)

export default app
