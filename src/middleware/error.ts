import { Request, Response, NextFunction } from "express"

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Unhandled error:", err)

  if (err.name === 'MulterError') {
    let multerMsg = err.message || 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      multerMsg = 'File size exceeds 5MB limit. Please upload a smaller image.';
    }
    return res.status(400).json({
      success: false,
      message: multerMsg,
    });
  }

  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  const statusCode = err.statusCode || err.status || 500
  const message = err.message || "Internal server error"

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  })
}

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl} - Route not found`,
  })
}
