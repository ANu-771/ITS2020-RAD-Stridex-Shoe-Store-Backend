import { Request, Response, NextFunction } from "express"
import { ZodSchema, ZodError } from "zod"

export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const errorDetails = error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        const firstMessage = error.issues[0]?.message;
        return res.status(400).json({
          success: false,
          message: firstMessage ? `Validation failed: ${firstMessage}` : "Validation failed",
          errors: errorDetails,
        });
      }
      return res.status(500).json({
        success: false,
        message: "Internal validation error",
      })
    }
  }
}

export const validate = validateRequest;
