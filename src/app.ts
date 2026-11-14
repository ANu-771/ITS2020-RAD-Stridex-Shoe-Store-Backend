import express, { Application, Request, Response } from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import path from "path"
import AuthRouter from "./routes/auth.routers"
import CategoryRouter from "./routes/category.routers"
import BrandRouter from "./routes/brand.routers"
import ProductRouter from "./routes/product.routers"
import ProductVariantRouter from "./routes/productVariant.routers"
import UploadRouter from "./routes/upload.routers"
import CartRouter from "./routes/cart.routers"
import WishlistRouter from "./routes/wishlist.routers"
import OrderRouter from "./routes/order.routers"
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
    version: "3.0.0",
    database: "MongoDB Atlas",
    timestamp: new Date().toISOString(),
  })
})

// Base API route
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    message: "Welcome to STRIDEX E-Commerce API",
    version: "3.0.0",
    currency: "LKR (Sri Lankan Rupees)",
    docs: "/api/health",
  })
})

// Feature Routes
app.use("/api/v1/auth", AuthRouter)
app.use("/api/v1/categories", CategoryRouter)
app.use("/api/v1/brands", BrandRouter)
app.use("/api/v1/products", ProductRouter)
app.use("/api/v1/variants", ProductVariantRouter)
app.use("/api/v1/upload", UploadRouter)
app.use("/api/v1/cart", CartRouter)
app.use("/api/v1/wishlist", WishlistRouter)
app.use("/api/v1/orders", OrderRouter)

// 404 & Centralized Error Handlers
app.use(notFoundHandler)
app.use(errorHandler)

export default app
