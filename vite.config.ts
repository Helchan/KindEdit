import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cp, readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const PDFJS_DIST_DIR = resolve(ROOT_DIR, 'node_modules/pdfjs-dist');
const PDFJS_ASSET_ROUTES = [
  { route: '/pdfjs/wasm/', dir: resolve(PDFJS_DIST_DIR, 'wasm') },
  { route: '/pdfjs/cmaps/', dir: resolve(PDFJS_DIST_DIR, 'cmaps') },
  { route: '/pdfjs/standard_fonts/', dir: resolve(PDFJS_DIST_DIR, 'standard_fonts') },
];

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.bcmap')) return 'application/octet-stream';
  if (filePath.endsWith('.ttf')) return 'font/ttf';
  if (filePath.endsWith('.pfb')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function isInsideDirectory(filePath: string, directory: string): boolean {
  return filePath === directory || filePath.startsWith(`${directory}${sep}`);
}

function pdfjsAssetsPlugin(): Plugin {
  return {
    name: 'kindedit-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestPath = decodeURIComponent((request.url || '').split('?')[0]);
        const route = PDFJS_ASSET_ROUTES.find((item) => requestPath.startsWith(item.route));
        if (!route) {
          next();
          return;
        }

        const relativePath = requestPath.slice(route.route.length);
        const filePath = resolve(route.dir, relativePath);
        if (!isInsideDirectory(filePath, route.dir)) {
          response.statusCode = 400;
          response.end('Bad Request');
          return;
        }

        try {
          const data = await readFile(filePath);
          response.setHeader('Content-Type', contentTypeFor(filePath));
          response.end(data);
        } catch {
          next();
        }
      });
    },
    async writeBundle() {
      await Promise.all(PDFJS_ASSET_ROUTES.map((route) => (
        cp(route.dir, resolve(ROOT_DIR, 'dist', route.route.slice(1)), { recursive: true })
      )));
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssetsPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
