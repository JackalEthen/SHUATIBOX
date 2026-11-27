// ponytail: 包自带 d.ts 没适配 exports 字段，这里补最小声明
declare module '@toast-ui/editor' {
  export default class Editor {
    constructor(options: Record<string, unknown>);
    getMarkdown(): string;
    setMarkdown(markdown: string, cursorToEnd?: boolean): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string): void;
    destroy(): void;
  }
}

declare module '@toast-ui/editor/viewer' {
  export default class Viewer {
    constructor(options: Record<string, unknown>);
    destroy(): void;
  }
}

declare module '@toast-ui/editor/dist/toastui-editor.css';
declare module '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
