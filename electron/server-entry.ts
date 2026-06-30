import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_PORT } from '../shared/constants.js';
import { createLocalServer } from './socket-server.js';
import { createAppPaths } from './services/path-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const directRoot = path.resolve(__dirname, '..');
const fallbackRoot = path.resolve(__dirname, '..', '..');
const projectRoot = fs.existsSync(path.join(directRoot, 'src', 'pages')) ? directRoot : fallbackRoot;

function readArg(name: string, fallback: string): string {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

async function main(): Promise<void> {
  const host = readArg('--host', process.env.HOST || '127.0.0.1');
  const port = Number.parseInt(readArg('--port', process.env.PORT || String(DEFAULT_PORT)), 10) || DEFAULT_PORT;
  const userDataDir = process.env.ROCO_DATA_DIR || path.join(projectRoot, 'LuokePVPWebui');
  const paths = createAppPaths(projectRoot, userDataDir);

  const localServer = await createLocalServer(paths, port, host);
  console.log(`Roco PVP WebUI server started at http://${host}:${localServer.port}`);

  const shutdown = async () => {
    await localServer.close().catch((error) => {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ERR_SERVER_NOT_RUNNING') {
        console.error('Failed to close server cleanly:', error);
      }
    });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
