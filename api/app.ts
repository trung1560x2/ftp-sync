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
import deploymentRoutes from './routes/deployment.js'
import contentDiffRoutes from './routes/contentDiff.js'
import aiRoutes from './routes/ai.js'
import terminalRoutes from './routes/terminal.js'
import settingsRoutes from './routes/settings.js'
import sshKeyRoutes from './routes/ssh-keys.js'
import portForwardRoutes from './routes/port-forwards.js'
import terminalConfigRoutes from './routes/terminal-config.js'
import { logStore } from './services/LogStore.js'
import { requireAuth } from './middleware/auth.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' vs:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*;"
  );
  next();
})
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files
const distPath = path.join(__dirname, '../../dist')
app.use(express.static(distPath))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (_req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

// Authenticate all remaining endpoints
app.use(requireAuth)

app.use('/api/ftp-connections', ftpRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/deployment', deploymentRoutes)
app.use('/api/content-diff', contentDiffRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/terminal', terminalRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/ssh-keys', requireAuth, sshKeyRoutes)
app.use('/api/port-forwards', requireAuth, portForwardRoutes)
app.use('/api/terminal-config', requireAuth, terminalConfigRoutes)


/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error Handler] Caught error:', error);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Server internal error' : error.message,
  });
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

// Shutdown hooks for emergency log flush + terminal cleanup
import sshTerminalService from './services/SSHTerminalService.js'

process.on('SIGINT', () => {
  console.log('SIGINT received. Cleaning up...');
  try {
    sshTerminalService.closeAll();
    logStore.flushSync();
  } catch (e) {
    console.error('Failed cleanup on SIGINT', e);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Cleaning up...');
  try {
    sshTerminalService.closeAll();
    logStore.flushSync();
  } catch (e) {
    console.error('Failed cleanup on SIGTERM', e);
  }
  process.exit(0);
});

import { webSocketService } from './services/WebSocketService.js'

// Intercept app.listen to dynamically bootstrap WebSocket server
const originalListen = app.listen.bind(app);
app.listen = function (...args: any[]) {
  const server = originalListen(...args);
  webSocketService.init(server);
  
  // Auto-start active port forwards on server startup
  import('./services/PortForwardService.js').then(({ portForwardService }) => {
    portForwardService.init().catch((err: any) => {
      console.error('Failed to auto-start port forwards:', err.message);
    });
  }).catch((err) => {
    console.error('Failed to load PortForwardService:', err);
  });

  return server;
} as any;

export default app


