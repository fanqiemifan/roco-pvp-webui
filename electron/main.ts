import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { app, BrowserWindow, Menu, Tray, dialog, nativeImage } from 'electron';

import { loadRuntimeConfig } from './services/config-service.js';
import { createAppPaths } from './services/path-service.js';
import { createLocalServer } from './socket-server.js';
import { registerWindowIpc } from './ipc/window-ipc.js';
import { registerFloatWindow } from './float-window.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const directRoot = path.resolve(__dirname, '..');
const fallbackRoot = path.resolve(__dirname, '..', '..');
const projectRoot = fs.existsSync(path.join(directRoot, 'src', 'pages')) ? directRoot : fallbackRoot;

let mainWindow: BrowserWindow | null = null;
let localServer: Awaited<ReturnType<typeof createLocalServer>> | null = null;
let appTray: Tray | null = null;
let isQuitting = false;
let closePromptPending = false;
const childWindows = new Map<string, BrowserWindow>();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

type WindowPreset = {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  autoHideMenuBar?: boolean;
  title?: string;
  zoomFactor?: number;
};

if (!hasSingleInstanceLock) {
  app.quit();
}

function resolveTrayIconPath(): string {
  const candidates = [
    path.join(projectRoot, 'src', 'assets', 'ui', 'start-1.png'),
    path.join(projectRoot, 'src', 'assets', 'ui', 'start-2.png'),
    path.join(projectRoot, 'src', 'assets', 'ui', 'start-3.png'),
  ];

  const iconPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!iconPath) {
    throw new Error('Tray icon asset not found.');
  }

  return iconPath;
}

function showMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  focusWindow(mainWindow);
}

function focusWindow(targetWindow: BrowserWindow): void {
  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }

  targetWindow.show();
  targetWindow.focus();
}

function getChildWindowKey(targetUrl: string): string {
  try {
    const parsedUrl = new URL(targetUrl);
    return `${parsedUrl.origin}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return targetUrl;
  }
}

function getWindowPath(targetUrl: string): string {
  try {
    return new URL(targetUrl).pathname;
  } catch {
    return targetUrl;
  }
}

function getWindowPreset(targetUrl: string): WindowPreset {
  const pathname = getWindowPath(targetUrl);
  if (pathname.endsWith('/float.html')) {
    return {
      width: 587,
      height: 56,
      zoomFactor: 1,
      autoHideMenuBar: true,
      title: '阵容悬浮窗',
    };
  }
  if (pathname.endsWith('/float-menu.html')) {
    return {
      width: 240,
      height: 240,
      zoomFactor: 1,
      autoHideMenuBar: true,
      title: '更换精灵',
    };
  }
  if (
    pathname.endsWith('/roco-pvp-page7.html')
    || pathname.endsWith('/roco-pvp-page2.html')
    || pathname.endsWith('/roco-pvp-page3.html')
    || pathname.endsWith('/')
  ) {
    return {
      width: 1920,
      height: 1080,
      minWidth: 960,
      minHeight: 540,
      zoomFactor: 1,
      autoHideMenuBar: true,
      title: '洛克王国 PVP WebUI - 预览',
    };
  }

  return {
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    zoomFactor: 1,
    autoHideMenuBar: true,
  };
}

function parseFeatureNumber(features: string, key: string): number | undefined {
  const match = features.split(',').map((part) => part.trim().toLowerCase()).find((part) => part.startsWith(`${key}=`));
  if (!match) {
    return undefined;
  }
  const value = Number(match.split('=')[1]);
  return Number.isFinite(value) ? value : undefined;
}

function configureWindowOpenHandler(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url, features }) => {
    const childWindowKey = getChildWindowKey(url);
    const existingChildWindow = childWindows.get(childWindowKey);
    if (existingChildWindow && !existingChildWindow.isDestroyed()) {
      focusWindow(existingChildWindow);
      return { action: 'deny' };
    }

    const preset = getWindowPreset(url);
    const pathname = getWindowPath(url);
    const isFloatPage = pathname.endsWith('/float.html') || pathname.endsWith('/float-menu.html');
    const childWindow = new BrowserWindow({
      useContentSize: true,
      width: preset.width,
      height: preset.height,
      minWidth: preset.minWidth,
      minHeight: preset.minHeight,
      autoHideMenuBar: preset.autoHideMenuBar ?? true,
      frame: !isFloatPage,
      transparent: isFloatPage,
      backgroundColor: isFloatPage ? '#00000000' : '#f4efe6',
      title: preset.title,
      resizable: !isFloatPage,
      maximizable: !isFloatPage,
      minimizable: !isFloatPage,
      fullscreenable: !isFloatPage,
      skipTaskbar: isFloatPage,
      hasShadow: !isFloatPage,
      alwaysOnTop: isFloatPage,
      x: parseFeatureNumber(features ?? '', 'left'),
      y: parseFeatureNumber(features ?? '', 'top'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    if (isFloatPage) {
      childWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    if (pathname.endsWith('/float-menu.html')) {
      childWindow.on('blur', () => {
        if (!childWindow.isDestroyed()) {
          childWindow.close();
        }
      });
    }

    childWindows.set(childWindowKey, childWindow);
    childWindow.removeMenu();
    registerWindowIpc();
    configureWindowOpenHandler(childWindow);
    childWindow.on('closed', () => {
      if (childWindows.get(childWindowKey) === childWindow) {
        childWindows.delete(childWindowKey);
      }
    });
    childWindow.webContents.on('did-finish-load', () => {
      if (preset.zoomFactor) {
        childWindow.webContents.setZoomFactor(preset.zoomFactor);
      }
    });
    void childWindow.loadURL(url).catch((error) => {
      console.error(`Failed to open child window for ${url}:`, error);
      childWindow.close();
    });

    return { action: 'deny' };
  });
}

function createTray(): void {
  if (appTray) {
    return;
  }

  const trayImage = nativeImage.createFromPath(resolveTrayIconPath()).resize({
    width: 16,
    height: 16,
  });

  appTray = new Tray(trayImage);
  appTray.setToolTip('洛克王国 PVP WebUI');
  appTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          showMainWindow();
        },
      },
      {
        label: '退出应用',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  appTray.on('double-click', () => {
    showMainWindow();
  });

  appTray.on('click', () => {
    showMainWindow();
  });
}

async function createMainWindow(): Promise<void> {
  const userDataDir = app.getPath('userData');
  const paths = createAppPaths(projectRoot, userDataDir);
  const runtimeConfig = loadRuntimeConfig(paths);

  localServer = await createLocalServer(paths, runtimeConfig.port);
  registerFloatWindow(() => localServer?.port ?? 0);

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

  createTray();
  registerWindowIpc();
  configureWindowOpenHandler(mainWindow);
  await mainWindow.loadURL(`http://127.0.0.1:${localServer.port}/admin.html`);

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();

    if (closePromptPending) {
      return;
    }

    closePromptPending = true;

    void dialog
      .showMessageBox(mainWindow!, {
        type: 'question',
        buttons: ['退出整个应用', '最小化到托盘', '取消'],
        defaultId: 1,
        cancelId: 2,
        title: '关闭应用',
        message: '关闭窗口时要执行什么操作？',
        detail: '选择“最小化到托盘”后，应用会继续在后台运行，可通过任务栏托盘图标恢复或退出。',
        noLink: true,
      })
      .then(({ response }) => {
        if (!mainWindow) {
          return;
        }

        if (response === 0) {
          isQuitting = true;
          app.quit();
          return;
        }

        if (response === 1) {
          mainWindow.hide();
        }
      })
      .finally(() => {
        closePromptPending = false;
      });
  });

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
    if (mainWindow) {
      showMainWindow();
      return;
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow().catch((error) => {
        console.error('Failed to re-open application:', error);
      });
    }
  });
});

app.on('second-instance', () => {
  showMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;

  if (localServer) {
    await localServer.close().catch((error) => {
      console.error('Failed to close local server cleanly:', error);
    });
    localServer = null;
  }

  if (appTray) {
    appTray.destroy();
    appTray = null;
  }
});
