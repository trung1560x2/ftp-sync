/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import ftpRoutes from './routes/ftp.js'
import syncRoutes from './routes/sync.js'
import fileRoutes from './routes/files.js'
import systemRoutes from './routes/system.js'
import reportRoutes from './routes/reports.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files
const distPath = path.join(__dirname, '../../dist')
app.use(express.static(distPath))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/ftp-connections', ftpRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/reports', reportRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({
      success: false,
      error: 'API not found',
    })
  } else {
    res.sendFile(path.join(distPath, 'index.html'))
  }
})

export default app
