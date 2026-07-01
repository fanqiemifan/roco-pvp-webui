import fs from 'node:fs/promises';

import { clipboard, dialog, ipcMain, shell, type BrowserWindow } from 'electron';

export function registerWindowIpc(window: BrowserWindow): void {
  ipcMain.removeHandler('roco:copy-text');
  ipcMain.handle('roco:copy-text', async (_event, text: string) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  ipcMain.removeHandler('roco:show-open-dialog');
  ipcMain.handle('roco:show-open-dialog', async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.removeHandler('roco:show-save-dialog');
  ipcMain.handle('roco:show-save-dialog', async () => {
    const result = await dialog.showSaveDialog(window, {
      defaultPath: 'roco-live-config.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });
    return result.canceled ? null : result.filePath ?? null;
  });

  ipcMain.removeHandler('roco:read-text-file');
  ipcMain.handle('roco:read-text-file', async (_event, filePath: string) => {
    return fs.readFile(filePath, 'utf-8');
  });

  ipcMain.removeHandler('roco:write-text-file');
  ipcMain.handle('roco:write-text-file', async (_event, filePath: string, text: string) => {
    await fs.writeFile(filePath, text, 'utf-8');
    return true;
  });

  ipcMain.removeHandler('roco:stat-file');
  ipcMain.handle('roco:stat-file', async (_event, filePath: string) => {
    const stat = await fs.stat(filePath);
    return {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  });

  ipcMain.removeHandler('roco:open-external');
  ipcMain.handle('roco:open-external', async (_event, target: string) => {
    await shell.openExternal(target);
    return true;
  });
}
