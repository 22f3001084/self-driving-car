import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `@types/node` is not a dependency here and this is the only line that wants
// it, so the one global it needs is declared rather than installed.
declare const process: { env: Record<string, string | undefined> }

// Which scene implementation `@scene` resolves to. Doing it here rather than
// with a runtime ternary is what keeps the flat edition's sprite art out of the
// 3D bundle: an ES import holds a module in the graph even when the branch that
// uses it is dead, so the 3D build was shipping three megabytes of retired PNGs
// it can never draw. A root-relative id ('/src/...') is resolved by Vite from
// the project root in both dev and build.
const FLAT = process.env.VITE_SCENE_2D === '1'
const sceneImpl = FLAT ? '/src/components/Scene2D.tsx' : '/src/components/Scene3D.tsx'

// The build must run by double-clicking dist/index.html straight from disk
// (file:// protocol) — no web server, no npm, fully offline. Two things make
// that work:
//   1. Output a single classic (non-module) script. Browsers block external
//      `<script type="module">` over file:// (CORS), but a plain
//      `<script src="./assets/app.js">` loads fine.
//   2. Emit every image/audio asset as a real file under assets/ (no base64
//      inlining) so the folder holds the game and its assets side by side.
export default defineConfig({
  plugins: [react(), classicScriptHtml()],
  resolve: { alias: { '@scene': sceneImpl } },
  // Each edition gets its OWN dep-cache. The 3D and flat dev servers run at
  // the same time in the test pipeline, and two Vites pre-bundling into one
  // node_modules/.vite raced — the loser served a corrupted React pair and
  // the flat app died on "Invalid hook call".
  cacheDir: FLAT ? 'node_modules/.vite-flat' : 'node_modules/.vite',
  base: './',
  build: {
    // Keep all assets as separate files in the assets/ folder.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    // `tmp/` holds throwaway test artifacts (e.g. browser profiles) whose
    // locked files crash Vite's file watcher on Windows. Never watch them.
    watch: {
      // Regex matches both / and \ separators (Windows) reliably.
      ignored: [/[/\\]tmp[/\\]/, /[/\\]dist[/\\]/, /[/\\]node_modules[/\\]/],
    },
  },
})

// Rewrite the generated index.html so it loads over file://: strip the
// `type="module"` / `crossorigin` attributes (which force a blocked CORS
// fetch) and drop any modulepreload hints.
function classicScriptHtml() {
  return {
    name: 'classic-script-html',
    // Build only. In dev, Vite serves `/src/main.tsx` as a real ES module and
    // stripping `type="module"` would stop the dev server dead.
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      return html
        .replace(/\s+type="module"/g, '')
        .replace(/\s+crossorigin/g, '')
        .replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '')
        // `type="module"` implied deferred execution; a classic script does
        // not, and this one lives in <head>, so make it wait for the DOM.
        .replace(/<script\s+src=/g, '<script defer src=')
    },
  }
}
