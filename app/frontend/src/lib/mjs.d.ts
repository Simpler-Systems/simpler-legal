// The engine is plain ESM (repo-root lib/*.mjs) imported into the webview
// bundle unchanged — typed at the boundary in engine.ts, not here.
declare module '*.mjs';
