import fs from 'node:fs';

import { DEFAULT_PORT } from '../../shared/constants.js';
import type { AppPaths } from './path-service.js';

export interface RuntimeConfig {
  port: number;
}

const DEFAULT_CONFIG: RuntimeConfig = { port: DEFAULT_PORT };

export function loadRuntimeConfig(paths: AppPaths): RuntimeConfig {
  if (!fs.existsSync(paths.configFile)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(paths.configFile, 'utf-8')) as Partial<RuntimeConfig>;
    const port = Number(payload.port);
    return {
      port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveRuntimeConfig(paths: AppPaths, config: RuntimeConfig): RuntimeConfig {
  fs.mkdirSync(paths.runtimeDir, { recursive: true });

  const normalized: RuntimeConfig = {
    port: Number.isInteger(config.port) && config.port > 0 && config.port <= 65535 ? config.port : DEFAULT_PORT,
  };

  fs.writeFileSync(paths.configFile, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}
