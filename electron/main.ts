import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { app, BrowserWindow } from 'electron';

import { loadRuntimeConfig } from './services/config-service.js';
import { createAppPaths } from './services/path-service.js';
import { createLocalServer } from './socket-server.js';
import { registerWindowIpc } from './ipc/window-ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const directRoot = path.resolve(__dirname, '..');
const fallbackRoot = path.resolve(__dirname, '..', '..');
const projectRoot = fs.existsSync(path.join(directRoot, 'src', 'pages')) ? directRoot : fallbackRoot;

let mainWindow: BrowserWindow | null = null;
let localServer: Awaited<ReturnType<typeof createLocalServer>> | null = null;

async function createMainWindow(): Promise<void> {
  const userDataDir = app.getPath('userData');
  const paths = createAppPaths(projectRoot, userDataDir);
  const runtimeConfig = loadRuntimeConfig(paths);

  localServer = await createLocalServer(paths, runtimeConfig.port);

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: '#f4efe6',
    title: '洛克王国 PVP WebUI',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerWindowIpc(mainWindow);
  await mainWindow.loadURL(`http://127.0.0.1:${localServer.port}/admin.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow().catch((error) => {
    console.error('Failed to start application:', error);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow().catch((error) => {
        console.error('Failed to re-open application:', error);
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (localServer) {
    await localServer.close().catch((error) => {
      console.error('Failed to close local server cleanly:', error);
    });
    localServer = null;
  }
});
