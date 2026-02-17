import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

function apiDevMiddleware() {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/check-headers', async (nodeReq, nodeRes) => {
        const reqUrl = new URL(nodeReq.url || '/', 'http://localhost');
        const query = Object.fromEntries(reqUrl.searchParams);

        const mockReq = {
          method: nodeReq.method,
          query: query,
          headers: nodeReq.headers,
        };

        let responded = false;
        const mockRes = {
          _statusCode: 200,
          _headers: {},
          setHeader(key, value) {
            this._headers[key] = value;
            if (!responded) nodeRes.setHeader(key, value);
          },
          status(code) {
            this._statusCode = code;
            return this;
          },
          json(data) {
            if (responded) return;
            responded = true;
            const body = JSON.stringify(data);
            nodeRes.writeHead(this._statusCode, {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            });
            nodeRes.end(body);
          },
          end() {
            if (responded) return;
            responded = true;
            nodeRes.writeHead(this._statusCode);
            nodeRes.end();
          },
        };

        try {
          const mod = await server.ssrLoadModule('/api/check-headers.js');
          await mod.default(mockReq, mockRes);
        } catch (err) {
          if (!responded) {
            nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
            nodeRes.end(JSON.stringify({ error: 'Dev server error: ' + err.message }));
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [apiDevMiddleware(), react()],
  build: {
    outDir: 'js/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'hero-app': resolve(__dirname, 'js/hero-app.jsx'),
      },
      output: {
        // Output as ES module, keep the name clean
        entryFileNames: '[name].js',
        // No chunk splitting -- single file
        inlineDynamicImports: true,
        format: 'es',
      },
    },
    // Don't copy public folder
    copyPublicDir: false,
  },
});
