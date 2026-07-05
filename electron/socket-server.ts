import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';

import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcrypt';

import { SOCKET_EVENTS } from '../shared/events.js';
import type { SnapshotPayload } from '../shared/types.js';
import { buildQuickFillPreview, listSprites, spriteMatchesKeyword } from './services/sprite-service.js';
import {
  getBackgroundState,
  saveBackground,
  deleteBackground,
  ensureRuntimeDirs,
  getAvatarStates,
  saveAvatar,
  deleteAvatar,
  readAvatarMimeType,
} from './services/image-service.js';
import { loadRuntimeConfig, saveRuntimeConfig } from './services/config-service.js';
import {
  createMatch,
  deleteMatch,
  deleteMatches,
  getMatchStore,
  recordMatchWinner,
  redoMatchAction,
  saveDraftPanelStateForActiveMatch,
  saveDraftPanelSlotStateForActiveMatch,
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
  savePanelSlotState,
  savePanelState,
  saveScoreboardBestOf,
  saveScoreboardState,
} from './services/state-service.js';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import type { AppPaths } from './services/path-service.js';

// Augment express-session to include our auth flag
declare module 'express-session' {
  interface SessionData {
    isAuthenticated?: boolean;
    sessionId?: string;
  }
}

const upload = multer({ storage: multer.memoryStorage() });

function snapshotPayload(paths: AppPaths): SnapshotPayload {
  return {
    panels: [getPanelState(paths, 'left'), getPanelState(paths, 'right')],
    scoreboard: getScoreboardState(paths),
    background: getBackgroundState(paths),
    avatars: getAvatarStates(paths),
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

export interface AuthConfig {
  username: string;
  password: string;
}

export async function createLocalServer(
  paths: AppPaths,
  port: number,
  host = '127.0.0.1',
  authConfig?: AuthConfig,
): Promise<LocalServer> {
  // Single-session tracking: only one active session at a time.
  // Each new login generates a random sessionId, invalidating all previous sessions.
  let activeSessionId: string | null = null;
  const hashedPassword = authConfig ? await bcrypt.hash(authConfig.password, 10) : null;

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

  // Session & cookie middleware for auth
  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'roco-pvp-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    },
  });

  app.use(cookieParser(process.env.SESSION_SECRET || 'roco-pvp-session-secret'));
  app.use(sessionMiddleware);

  // Share session with Socket.IO so admin sockets can verify auth
  io.engine.use(sessionMiddleware);

  // Static files (public, no auth)
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

  // === Public routes (no auth required) ===
  app.get('/', (_request, response) => sendPage(paths, response, 'index.html'));
  app.get('/login.html', (_request, response) => sendPage(paths, response, 'login.html'));
  app.get('/roco-pvp.html', (_request, response) => sendPage(paths, response, 'roco-pvp.html'));
  app.get('/roco-pvp-page3.html', (_request, response) => sendPage(paths, response, 'roco-pvp-page3.html'));
  app.get('/live-standby-demo.html', (_request, response) => sendPage(paths, response, 'live-standby-demo.html'));

  // Auth API — always public
  app.post('/api/auth/login', async (req, res) => {
    // Auth disabled in desktop mode
    if (!authConfig) {
      req.session.isAuthenticated = true;
      return res.json({ success: true });
    }
    const { username, password } = req.body || {};
    try {
      const passwordMatch = await bcrypt.compare(password || '', hashedPassword!);
      if (username === authConfig.username && passwordMatch) {
        // Invalidate all previous sessions by rotating the active session ID
        activeSessionId = crypto.randomUUID();
        req.session.sessionId = activeSessionId;
        req.session.isAuthenticated = true;
        return res.json({ success: true });
      }
    } catch {
      // bcrypt compare failed — fall through to error
    }
    res.status(401).json({ success: false, error: '账号或密码错误' });
  });

  app.post('/api/auth/logout', (req, res) => {
    activeSessionId = crypto.randomUUID(); // invalidate any lingering sessions
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get('/api/auth/check', (req, res) => {
    if (!authConfig) {
      return res.json({ authenticated: true });
    }
    if (req.session?.isAuthenticated && req.session.sessionId === activeSessionId) {
      return res.json({ authenticated: true });
    }
    res.status(401).json({ authenticated: false });
  });

  // === Auth guard for protected routes ===
  if (authConfig) {
    app.use((req, res, next) => {
      const publicStaticPrefixes = [
        '/scripts', '/styles', '/assets', '/resources', '/runtime',
        '/img-2', '/img', '/image', '/json', '/font', '/cache',
      ];
      const isPublicStatic = publicStaticPrefixes.some(p =>
        req.path === p || req.path.startsWith(p + '/')
      );
      const isPublicPage = ['/', '/login.html', '/roco-pvp.html', '/roco-pvp-page3.html', '/live-standby-demo.html'].includes(req.path);
      const isAuthApi = req.path.startsWith('/api/auth/');
      const isFavicon = req.path === '/favicon.ico';

      if (isPublicStatic || isPublicPage || isAuthApi || isFavicon) return next();
      // Verify both authenticated flag AND single-session ID match
      if (req.session?.isAuthenticated && req.session.sessionId === activeSessionId) return next();

    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, error: '请先登录' });
    }
    res.redirect('/login.html');
    });
  }

  // === Protected routes (auth required when authConfig is set) ===
  app.get('/admin.html', (_request, response) => sendPage(paths, response, 'admin.html'));
  app.get('/live-control.html', (_request, response) => sendPage(paths, response, 'live-control.html'));

  app.get('/api/images', (_request, response) => {
    response.json({ images: [getPanelState(paths, 'left'), getPanelState(paths, 'right')] });
  });

  app.get('/api/background', (_request, response) => {
    response.json(getBackgroundState(paths));
  });

  app.get('/api/avatars', (_request, response) => {
    response.json(getAvatarStates(paths));
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

      if (activeMatch && activeGame?.status === 'in_progress') {
        const panel = savePanelState(paths, position, request.body?.selected ?? []);
        const matches = saveDraftPanelStateForActiveMatch(paths, position, request.body?.selected ?? []);
        io.emit(SOCKET_EVENTS.panelUpdate, { panel });
        io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
        response.json({ success: true, panel, matches });
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

  app.patch('/api/panels/:position/slots/:slot', (request, response) => {
    const position = request.params.position;
    const slotIndex = Number.parseInt(request.params.slot, 10);
    if (position !== 'left' && position !== 'right') {
      response.status(404).json({ success: false, error: 'Invalid position' });
      return;
    }
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 6) {
      response.status(400).json({ success: false, error: 'Invalid slot index' });
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
        const matches = saveDraftPanelSlotStateForActiveMatch(paths, position, slotIndex, request.body?.slot ?? null);
        io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
        response.json({ success: true, matches });
        return;
      }

      if (activeMatch && activeGame?.status === 'in_progress') {
        const panel = savePanelSlotState(paths, position, slotIndex, request.body?.slot ?? null);
        const matches = saveDraftPanelSlotStateForActiveMatch(paths, position, slotIndex, request.body?.slot ?? null);
        io.emit(SOCKET_EVENTS.panelUpdate, { panel });
        io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
        response.json({ success: true, panel, matches });
        return;
      }

      const panel = savePanelSlotState(paths, position, slotIndex, request.body?.slot ?? null);
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

      if (activeMatch && activeGame?.status === 'in_progress') {
        clearPanelState(paths, position);
        const panel = getPanelState(paths, position);
        const matches = saveDraftPanelStateForActiveMatch(paths, position, []);
        io.emit(SOCKET_EVENTS.panelUpdate, { panel });
        io.emit(SOCKET_EVENTS.matchesUpdate, { matches });
        response.json({ success: true, position, panel, matches });
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

  app.post('/api/upload/avatar/:side', upload.single('file'), (request, response) => {
    const side = request.params.side;
    if (side !== 'left' && side !== 'right') {
      response.status(400).json({ success: false, error: 'Invalid avatar side' });
      return;
    }
    if (!request.file?.buffer) {
      response.status(400).json({ success: false, error: 'No file data' });
      return;
    }

    const avatar = saveAvatar(paths, side, request.file.buffer, request.file.mimetype);
    io.emit(SOCKET_EVENTS.avatarUpdate, { side, avatar, avatars: getAvatarStates(paths) });
    response.json({ success: true, side, avatar });
  });

  app.delete('/api/delete/avatar/:side', (request, response) => {
    const side = request.params.side;
    if (side !== 'left' && side !== 'right') {
      response.status(400).json({ success: false, error: 'Invalid avatar side' });
      return;
    }

    const avatar = deleteAvatar(paths, side);
    io.emit(SOCKET_EVENTS.avatarUpdate, { side, avatar, avatars: getAvatarStates(paths) });
    response.json({ success: true, side, avatar });
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

  app.get('/api/avatar/left-avatar.png', (_request, response) => {
    if (!fs.existsSync(paths.leftAvatarFile)) {
      response.status(404).end();
      return;
    }
    response.type(readAvatarMimeType(paths, 'left'));
    response.sendFile(paths.leftAvatarFile);
  });

  app.get('/api/avatar/right-avatar.png', (_request, response) => {
    if (!fs.existsSync(paths.rightAvatarFile)) {
      response.status(404).end();
      return;
    }
    response.type(readAvatarMimeType(paths, 'right'));
    response.sendFile(paths.rightAvatarFile);
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
