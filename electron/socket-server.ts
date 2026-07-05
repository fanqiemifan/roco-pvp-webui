import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';

import { SOCKET_EVENTS } from '../shared/events.js';
import type { SnapshotPayload } from '../shared/types.js';
import { buildQuickFillPreview, listSprites, spriteMatchesKeyword } from './services/sprite-service.js';
import { getBackgroundState, saveBackground, deleteBackground, ensureRuntimeDirs } from './services/image-service.js';
import { loadRuntimeConfig, saveRuntimeConfig } from './services/config-service.js';
import {
  createMatch,
  deleteMatch,
  deleteMatches,
  getMatchStore,
  recordMatchWinner,
  redoMatchAction,
  saveDraftPanelStateForActiveMatch,
  setActiveMatch,
  startCurrentGame,
  syncActiveMatchLineupsFromPanels,
  undoDeletedMatches,
  undoMatchAction,
  updateMatch,
} from './services/match-service.js';
import {
  clearPanelState,
  getPanelState,
  getScoreboardState,
  savePanelState,
  saveScoreboardBestOf,
  saveScoreboardState,
} from './services/state-service.js';
import type { AppPaths } from './services/path-service.js';

const upload = multer({ storage: multer.memoryStorage() });

function snapshotPayload(paths: AppPaths): SnapshotPayload {
  return {
    panels: [getPanelState(paths, 'left'), getPanelState(paths, 'right')],
    scoreboard: getScoreboardState(paths),
    background: getBackgroundState(paths),
    matches: getMatchStore(paths),
  };
}

function sendPage(paths: AppPaths, response: Response, pageFile: string): void {
  response.sendFile(path.join(paths.pagesDir, pageFile));
}

export interface LocalServer {
  port: number;
  server: http.Server;
  io: SocketIOServer;
  close(): Promise<void>;
}

export async function createLocalServer(
  paths: AppPaths,
  port: number,
  host = '127.0.0.1',
): Promise<LocalServer> {
  ensureRuntimeDirs(paths);

  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
    },
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/scripts', express.static(paths.scriptsDir));
  app.use('/styles', express.static(paths.stylesDir));
  app.use('/assets', express.static(paths.assetsDir));
  app.use('/resources', express.static(paths.resourcesDir));
  app.use('/runtime', express.static(paths.cacheDir));

  app.use('/img', express.static(paths.spritesDir));
  app.use('/img-2', express.static(paths.spritesAltDir));
  app.use('/json', express.static(paths.dataDir));
  app.use('/image', express.static(path.join(paths.assetsDir, 'ui')));
  app.use('/font', express.static(path.join(paths.assetsDir, 'fonts')));

  app.get('/', (_request, response) => sendPage(paths, response, 'index.html'));
  app.get('/admin.html', (_request, response) => sendPage(paths, response, 'admin.html'));
  app.get('/live-control.html', (_request, response) => sendPage(paths, response, 'live-control.html'));
  app.get('/roco-pvp.html', (_request, response) => sendPage(paths, response, 'roco-pvp.html'));
  app.get('/roco-pvp-page3.html', (_request, response) => sendPage(paths, response, 'roco-pvp-page3.html'));

  app.get('/api/images', (_request, response) => {
    response.json({ images: [getPanelState(paths, 'left'), getPanelState(paths, 'right')] });
  });

  app.get('/api/background', (_request, response) => {
    response.json(getBackgroundState(paths));
  });

  app.get('/api/scoreboard', (_request, response) => {
    response.json(getScoreboardState(paths));
  });

  app.get('/api/matches', (_request, response) => {
    response.json(getMatchStore(paths));
  });

  app.post('/api/matches', (request, response) => {
    try {
      const matches = createMatch(paths, request.body ?? {});
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch('/api/matches/:matchId', (request, response) => {
    try {
      const matches = updateMatch(paths, request.params.matchId, request.body ?? {});
      const scoreboard = getScoreboardState(paths);
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      response.json({ success: true, matches, scoreboard });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/matches/:matchId', (_request, response) => {
    try {
      const matches = deleteMatch(paths, _request.params.matchId);
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/matches/history/delete', (request, response) => {
    try {
      const matches = deleteMatches(paths, request.body?.matchIds ?? []);
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/matches/history/undo-delete', (_request, response) => {
    try {
      const matches = undoDeletedMatches(paths);
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/matches/:matchId/select', (request, response) => {
    try {
      const matches = setActiveMatch(paths, request.params.matchId);
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/matches/:matchId/winner', (request, response) => {
    try {
      const winner = request.body?.winner;
      if (winner !== 'left' && winner !== 'right') {
        throw new Error('winner must be left or right');
      }
      const matches = recordMatchWinner(paths, request.params.matchId, winner);
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/matches/:matchId/start', (request, response) => {
    try {
      const matches = startCurrentGame(paths, request.params.matchId);
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/matches/:matchId/undo', (_request, response) => {
    try {
      const matches = undoMatchAction(paths, _request.params.matchId);
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/matches/:matchId/redo', (_request, response) => {
    try {
      const matches = redoMatchAction(paths, _request.params.matchId);
      const scoreboard = getScoreboardState(paths);
      const panels = [getPanelState(paths, 'left'), getPanelState(paths, 'right')];
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      panels.forEach((panel) => io.emit(SOCKET_EVENTS.panelUpdate, { panel }));
      response.json({ success: true, matches, scoreboard, panels });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/scoreboard', (request, response) => {
    try {
      const scoreboard = saveScoreboardState(paths, request.body ?? {});
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      response.json({ success: true, scoreboard });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/scoreboard/best-of', (request, response) => {
    try {
      const scoreboard = saveScoreboardBestOf(paths, request.body ?? {});
      io.emit(SOCKET_EVENTS.scoreboardUpdate, { scoreboard });
      response.json({ success: true, scoreboard });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/sprites', (request, response) => {
    const keyword = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const sprites = listSprites(paths).filter((sprite) => !keyword || spriteMatchesKeyword(sprite, keyword));
    response.json({ sprites, count: sprites.length });
  });

  app.post('/api/panels/:position', (request, response) => {
    const position = request.params.position;
    if (position !== 'left' && position !== 'right') {
      response.status(404).json({ success: false, error: 'Invalid position' });
      return;
    }

    try {
      const activeStore = getMatchStore(paths);
      const activeMatch = activeStore.matches.find((match) => match.id === activeStore.activeMatchId);
      const activeGame =
        activeMatch?.games.find((game) => game.status === 'in_progress')
        ?? activeMatch?.games.find((game) => game.status === 'pending')
        ?? null;

      if (activeMatch && activeGame?.status === 'pending') {
        const matches = saveDraftPanelStateForActiveMatch(paths, position, request.body?.selected ?? []);
        io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
        response.json({ success: true, matches });
        return;
      }

      const panel = savePanelState(paths, position, request.body?.selected ?? []);
      const matches = syncActiveMatchLineupsFromPanels(paths);
      io.emit(SOCKET_EVENTS.panelUpdate, { panel });
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      response.json({ success: true, panel, matches });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(message.startsWith('Sprite not found') ? 404 : 400).json({ success: false, error: message });
    }
  });

  app.delete('/api/panels/:position', (request, response) => {
    const position = request.params.position;
    if (position !== 'left' && position !== 'right') {
      response.status(404).json({ success: false, error: 'Invalid position' });
      return;
    }

    try {
      const activeStore = getMatchStore(paths);
      const activeMatch = activeStore.matches.find((match) => match.id === activeStore.activeMatchId);
      const activeGame =
        activeMatch?.games.find((game) => game.status === 'in_progress')
        ?? activeMatch?.games.find((game) => game.status === 'pending')
        ?? null;

      if (activeMatch && activeGame?.status === 'pending') {
        const matches = saveDraftPanelStateForActiveMatch(paths, position, []);
        io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
        response.json({ success: true, position, matches });
        return;
      }

      clearPanelState(paths, position);
      const panel = getPanelState(paths, position);
      const matches = syncActiveMatchLineupsFromPanels(paths);
      io.emit(SOCKET_EVENTS.panelUpdate, { panel });
      io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
      response.json({ success: true, position, panel, matches });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/quick-fill', (request, response) => {
    try {
      const preview = buildQuickFillPreview(paths, String(request.body?.text ?? ''));
      response.json({ success: true, ...preview });
    } catch (error) {
      response.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/upload/background', upload.single('file'), (request, response) => {
    if (!request.file?.buffer) {
      response.status(400).json({ success: false, error: 'No file data' });
      return;
    }

    const background = saveBackground(paths, request.file.buffer);
    io.emit(SOCKET_EVENTS.backgroundUpdate, { background });
    response.json({ success: true, ...background });
  });

  app.delete('/api/delete/background', (_request, response) => {
    const background = deleteBackground(paths);
    io.emit(SOCKET_EVENTS.backgroundUpdate, { background });
    response.json({ success: true, position: 'background', background });
  });

  app.get('/api/runtime-config', (_request, response) => {
    response.json(loadRuntimeConfig(paths));
  });

  app.post('/api/runtime-config', (request, response) => {
    const config = saveRuntimeConfig(paths, {
      port: Number(request.body?.port),
    });
    response.json({ success: true, config });
  });

  app.get('/cache/background.png', (_request, response) => {
    if (!fs.existsSync(paths.backgroundFile)) {
      response.status(404).end();
      return;
    }
    response.sendFile(paths.backgroundFile);
  });

  io.on('connection', (socket) => {
    socket.emit(SOCKET_EVENTS.snapshot, snapshotPayload(paths));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    port,
    server,
    io,
    async close() {
      await new Promise<void>((resolve, reject) => {
        io.close(() => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      });
    },
  };
}
