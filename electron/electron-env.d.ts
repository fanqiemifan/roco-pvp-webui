export {};

declare global {
  interface Window {
    rocoDesktop?: {
      copyText(text: string): Promise<boolean>;
      showOpenDialog(): Promise<string | null>;
      showSaveDialog(): Promise<string | null>;
      readTextFile(filePath: string): Promise<string>;
      writeTextFile(filePath: string, text: string): Promise<boolean>;
      statFile(filePath: string): Promise<{ mtimeMs: number; size: number }>;
      openExternal(target: string): Promise<boolean>;
    };
  }
}
