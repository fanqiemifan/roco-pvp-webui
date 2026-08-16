import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, ipcMain, screen } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FLOAT_WINDOW_WIDTH = 782;
const FLOAT_WINDOW_HEIGHT = 74;
const DEFAULT_FLOAT_SHAPE = { x: 0, y: 0, width: FLOAT_WINDOW_WIDTH, height: FLOAT_WINDOW_HEIGHT };
const FLOAT_MENU_WIDTH = 380;
const FLOAT_MENU_HEIGHT = 210;

let floatWindow: BrowserWindow | null = null;
let floatMenuWindow: BrowserWindow | null = null;
let floatShapeSet = false;
let registered = false;
let getServerPort: () => number = () => 0;

function floatPosFile(): string {
  return path.join(app.getPath('userData'), 'float-window-pos.json');
}

function readFloatPosition(): [number, number] | null {
  try {
    const raw = fs.readFileSync(floatPosFile(), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length === 2 && Number.isFinite(parsed[0]) && Number.isFinite(parsed[1])) {
      return [parsed[0] as number, parsed[1] as number];
    }
  } catch {
    // 无记录或损坏时用默认位置
  }
  return null;
}

function saveFloatPosition(x: number, y: number): void {
  try {
    fs.writeFileSync(floatPosFile(), JSON.stringify([x, y]), 'utf-8');
  } catch {
    // 忽略写盘失败
  }
}

function applyFloatShape(rect: { x: number; y: number; width: number; height: number }): void {
  if (!floatWindow || floatWindow.isDestroyed() || typeof floatWindow.setShape !== 'function') {
    return;
  }
  const [winW, winH] = floatWindow.getContentSize();
  const x = Math.max(0, Math.min(winW - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(winH - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(winW - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(winH - y, Math.round(rect.height)));
  floatWindow.setShape([{ x, y, width, height }]);
  floatShapeSet = true;
}

function createFloatWindow(getPort: () => number): BrowserWindow {
  if (floatWindow && !floatWindow.isDestroyed()) {
    return floatWindow;
  }

  const savedPosition = readFloatPosition();
  floatWindow = new BrowserWindow({
    width: FLOAT_WINDOW_WIDTH,
    height: FLOAT_WINDOW_HEIGHT,
    x: savedPosition?.[0],
    y: savedPosition?.[1],
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  floatWindow.setAlwaysOnTop(true, 'screen-saver');
  floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const port = getPort();
  const tryLoad = (attempt: number): void => {
    if (!floatWindow || floatWindow.isDestroyed()) {
      return;
    }
    floatWindow
      .loadURL(`http://127.0.0.1:${port}/float.html`)
      .catch(() => {
        if (attempt < 10) {
          setTimeout(() => tryLoad(attempt + 1), 500);
        }
      });
  };
  tryLoad(0);

  floatWindow.on('moved', () => {
    if (floatWindow && !floatWindow.isDestroyed()) {
      const [x, y] = floatWindow.getPosition();
      saveFloatPosition(x, y);
    }
  });

  floatWindow.on('closed', () => {
    floatWindow = null;
    closeFloatMenuWindow();
  });

  floatShapeSet = false;
  setTimeout(() => {
    if (floatWindow && !floatWindow.isDestroyed() && !floatShapeSet) {
      applyFloatShape(DEFAULT_FLOAT_SHAPE);
    }
  }, 3000);

  return floatWindow;
}

function showFloatWindow(getPort: () => number): void {
  const win = createFloatWindow(getPort);
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.moveTop();
  win.focus();
}

function hideFloatWindow(): void {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.hide();
  }
}

function toggleFloatWindow(getPort: () => number): void {
  // 已打开时再次点击：直接显示并聚焦已存在的窗口，不再重复创建
  showFloatWindow(getPort);
}

function closeFloatWindow(): void {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.close();
  }
}

function closeFloatMenuWindow(): void {
  if (floatMenuWindow && !floatMenuWindow.isDestroyed()) {
    floatMenuWindow.close();
  }
  floatMenuWindow = null;
}

function openFloatMenuWindow(payload: { side: string; slot: number }): void {
  if (payload.side !== 'left' && payload.side !== 'right') {
    return;
  }
  const slot = Number.parseInt(String(payload.slot), 10);
  if (!Number.isInteger(slot) || slot < 0 || slot >= 6) {
    return;
  }

  closeFloatMenuWindow();

  const parentBounds = floatWindow && !floatWindow.isDestroyed() ? floatWindow.getBounds() : null;
  const display = parentBounds
    ? screen.getDisplayMatching(parentBounds)
    : screen.getPrimaryDisplay();
  const area = display.workArea;

  let x = parentBounds ? parentBounds.x + parentBounds.width + 4 : area.x + 60;
  let y = parentBounds ? parentBounds.y : area.y + 60;
  x = Math.max(area.x, Math.min(x, area.x + area.width - FLOAT_MENU_WIDTH));
  y = Math.max(area.y, Math.min(y, area.y + area.height - FLOAT_MENU_HEIGHT));

  floatMenuWindow = new BrowserWindow({
    width: FLOAT_MENU_WIDTH,
    height: FLOAT_MENU_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  floatMenuWindow.setAlwaysOnTop(true, 'screen-saver');
  void floatMenuWindow
    .loadURL(`http://127.0.0.1:${getServerPort()}/float-menu.html?side=${encodeURIComponent(payload.side)}&slot=${slot}`)
    .catch((error) => {
      console.error('Failed to open float menu window:', error);
      closeFloatMenuWindow();
    });
  floatMenuWindow.on('closed', () => {
    floatMenuWindow = null;
  });
}

export function registerFloatWindow(getPort: () => number): void {
  if (registered) {
    return;
  }
  registered = true;
  getServerPort = getPort;

  ipcMain.on('float:toggle', () => toggleFloatWindow(getPort));
  ipcMain.on('float:close', () => closeFloatWindow());
  ipcMain.on('float:menu-close', () => closeFloatMenuWindow());
  ipcMain.on('float:menu', (_event, payload) => {
    openFloatMenuWindow(payload);
  });
  ipcMain.on('float:shape', (event, rect) => {
    if (!floatWindow || floatWindow.isDestroyed() || event.sender !== floatWindow.webContents) {
      return;
    }
    if (
      !rect
      || !Number.isFinite(rect.x)
      || !Number.isFinite(rect.y)
      || !Number.isFinite(rect.width)
      || !Number.isFinite(rect.height)
    ) {
      return;
    }
    applyFloatShape(rect);
  });
}
