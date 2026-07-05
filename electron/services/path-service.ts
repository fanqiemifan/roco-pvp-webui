import path from 'node:path';

export interface AppPaths {
  projectRoot: string;
  pagesDir: string;
  scriptsDir: string;
  stylesDir: string;
  assetsDir: string;
  resourcesDir: string;
  spritesDir: string;
  spritesAltDir: string;
  dataDir: string;
  runtimeDir: string;
  cacheDir: string;
  backgroundFile: string;
  scoreboardFile: string;
  matchesFile: string;
  configFile: string;
  panelStatePath(position: 'left' | 'right'): string;
}

export function createAppPaths(projectRoot: string, userDataDir: string): AppPaths {
  const runtimeDir = path.join(userDataDir, 'runtime');
  const cacheDir = path.join(runtimeDir, 'cache');

  return {
    projectRoot,
    pagesDir: path.join(projectRoot, 'src', 'pages'),
    scriptsDir: path.join(projectRoot, 'src', 'scripts'),
    stylesDir: path.join(projectRoot, 'src', 'styles'),
    assetsDir: path.join(projectRoot, 'src', 'assets'),
    resourcesDir: path.join(projectRoot, 'resources'),
    spritesDir: path.join(projectRoot, 'resources', 'sprites'),
    spritesAltDir: path.join(projectRoot, 'resources', 'sprites-alt'),
    dataDir: path.join(projectRoot, 'resources', 'data'),
    runtimeDir,
    cacheDir,
    backgroundFile: path.join(cacheDir, 'background.png'),
    scoreboardFile: path.join(cacheDir, 'scoreboard.json'),
    matchesFile: path.join(cacheDir, 'matches.json'),
    configFile: path.join(runtimeDir, 'config.json'),
    panelStatePath(position: 'left' | 'right') {
      return path.join(cacheDir, `${position}.json`);
    },
  };
}
