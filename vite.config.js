import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

function apiDevMiddleware() {
  const apiRoutes = {
    '/api/check-headers': '/api/check-headers.js',
    '/api/proof-center-status': '/api/proof-center-status.js',
  };

  function createMockResponse(nodeRes) {
    let responded = false;
    return {
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
  }

  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      Object.entries(apiRoutes).forEach(([route, modulePath]) => {
        server.middlewares.use(route, async (nodeReq, nodeRes) => {
          const reqUrl = new URL(nodeReq.url || '/', 'http://localhost');
          const query = Object.fromEntries(reqUrl.searchParams);

          const mockReq = {
            method: nodeReq.method,
            query: query,
            headers: nodeReq.headers,
          };

          const mockRes = createMockResponse(nodeRes);

          try {
            const mod = await server.ssrLoadModule(modulePath);
            await mod.default(mockReq, mockRes);
          } catch (err) {
            nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
            nodeRes.end(JSON.stringify({ error: 'Dev server error: ' + err.message }));
          }
        });
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
        'risk-calculator': resolve(__dirname, 'js/RiskCalculator.jsx'),
      },
      output: {
        // Output as ES module, keep the name clean
        entryFileNames: '[name].js',
        // No chunk splitting -- single file per entry
        inlineDynamicImports: false,
        format: 'es',
      },
    },
    // Don't copy public folder
    copyPublicDir: false,
  },
});
