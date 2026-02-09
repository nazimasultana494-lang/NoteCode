export {};

declare global {
  interface Window {
    api?: {
      openFile: () => Promise<{ path?: string; content: string } | null>;
      saveFile: (payload: { content: string; saveAs?: boolean }) => Promise<{ path?: string } | null>;
      runCode: (payload: { language: 'java' | 'c' | 'cpp'; source: string }) => Promise<{ supported?: boolean; stdout?: string; stderr?: string; exitCode?: number } | null>;
    };
  }
}
