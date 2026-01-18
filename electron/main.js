import { app, BrowserWindow, Tray, Menu, nativeImage, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Do NOT import expressApp statically - it will try to init DB before DB_PATH is set
// import expressApp from '../dist-server/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let server;
let tray = null;
let isQuitting = false;
let serverPort = 0;

// Set DB Path BEFORE any other code runs
// Note: app.getPath() works even before app is ready for 'userData'
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'ftp_manager.sqlite');
process.env.DB_PATH = dbPath;

// Ensure db directory exists
if (!fs.existsSync(userDataPath)) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
  } catch (e) {
    console.error('Failed to create userData directory', e);
  }
}

console.log('Database Path set to:', dbPath);

async function startServer() {
  return new Promise(async (resolve, reject) => {
    try {
      // Dynamic import for ES module
      const expressAppModule = await import('../dist-server/api/app.js');
      const expressApp = expressAppModule.default;

      const serverInstance = expressApp.listen(0, '127.0.0.1', () => {
        const address = serverInstance.address();
        serverPort = typeof address === 'string' ? 0 : address.port;
        console.log(`Server running on port ${serverPort}`);
        resolve(serverPort);
      });
      serverInstance.on('error', (err) => reject(err));
      server = serverInstance;
    } catch (err) {
      reject(err);
    }
  });
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../dist/icon.png')
  });

  // Load backend and then URL
  // We can just rely on startServer having updated the mainWindow logURL if already running?
  // Or better call startServer here if not started?
  // Let's call startServer in 'ready' handling.

  // Handle Close event to minimize to tray
  mainWindow.on('close', function (event) {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // Create Tray...
  if (!tray) {
    // In production, icon is in resources folder. In dev, it's in build folder.
    let iconPath;

    // Check if we're in a packaged app
    if (app.isPackaged) {
      // In packaged app, try resources folder first
      iconPath = path.join(process.resourcesPath, 'icon.png');
      if (!fs.existsSync(iconPath)) {
        // Fallback to app directory
        iconPath = path.join(path.dirname(app.getPath('exe')), 'resources', 'icon.png');
      }
    } else {
      // Development mode
      iconPath = path.join(__dirname, '../build/icon.png');
    }

    console.log('Tray icon path:', iconPath, 'exists:', fs.existsSync(iconPath));

    // If still not found, create a simple colored icon
    let icon;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    } else {
      // Fallback: create a simple 16x16 icon
      console.warn('Icon not found, using fallback');
      icon = nativeImage.createEmpty();
    }

    // Resize for tray (16x16 on Windows)
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 16, height: 16 });
    }

    tray = new Tray(icon);
    tray.setToolTip('FTP Sync Manager');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Dashboard',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
}

// We need to attach the static file serving logic BEFORE listening
// But we imported the initialized app.
// Express apps are mutable. We can add middleware.
// However, api/app.ts has a 404 handler at the end.
// If we add middleware now, it will be AFTER the 404 handler?
// api/app.ts:
// ... routes ...
// app.use(404 handler)
// export default app

// If we add static middleware now, it will be pushed to the stack AFTER the 404 handler, so it won't be reached.
// We should modify api/app.ts to serve static files if in production or if configured.
// OR: modifying api/app.ts is safer.

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('ready', async () => {
    try {
      const port = await startServer();
      createWindow();
      if (mainWindow) {
        mainWindow.loadURL(`http://127.0.0.1:${port}`);
      }
    } catch (err) {
      dialog.showErrorBox('Startup Error', `Failed to start server:\n${err.message}`);
      app.quit();
    }
  });

  app.on('window-all-closed', function () {
    // Do not quit when window is closed, as we are running in tray
    // if (process.platform !== 'darwin') {
    //   if (server) server.close();
    //   app.quit();
    // }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (server) server.close();
  });

  app.on('activate', function () {
    if (mainWindow === null) {
      if (!server) {
        startServer().then(createWindow);
      } else {
        createWindow();
      }
    } else {
      mainWindow.show();
    }
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Uncaught Exception', error.message + '\n' + error.stack);
});
