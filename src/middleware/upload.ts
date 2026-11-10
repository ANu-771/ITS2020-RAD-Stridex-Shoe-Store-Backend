// import multer from "multer"
// import path from "path"
// import fs from "fs"

// // Automatically create the "uploads" folder at the project root if it doesn't exist
// const uploadDir = path.join(__dirname, "../../uploads")
// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true })
// }

// const storage = multer.diskStorage({
//   destination: (_req, _file, cb) => {
//     cb(null, uploadDir)
//   },
//   filename: (_req, file, cb) => {
//     const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
//     cb(null, uniqueSuffix + path.extname(file.originalname))
//   }
// })

// export const upload = multer({
//   storage,
//   limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
// })



import multer from "multer"

// Store file in memory (RAM) as req.file.buffer so Supabase can upload it directly
const storage = multer.memoryStorage()

export const upload = multer({
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  }
})