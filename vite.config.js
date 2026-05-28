import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

function apiDevMiddleware() {
  const apiRoutes = {
    '/api/check-headers': '/api/check-headers.js',
    '/api/checkout/webhook': '/api/checkout-webhook.js',
    '/api/checkout': '/api/checkout.js',
    '/api/order-status': '/api/order-status.js',
    '/api/proof-center-status': '/api/proof-center-status.js',
    '/api/crm-lead-scoring': '/api/crm-lead-scoring.js',

    '/api/cron/monitoring': '/api/cron/monitoring.js',
    '/api/cron/reaudit': '/api/cron/reaudit.js',

  };

  function readRequestBody(nodeReq) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      nodeReq.on('data', (chunk) => chunks.push(chunk));
      nodeReq.on('error', reject);
      nodeReq.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) {
          resolve(undefined);
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          resolve(raw);
        }
      });
    });
  }

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
            url: route,
            body: await readRequestBody(nodeReq),
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

