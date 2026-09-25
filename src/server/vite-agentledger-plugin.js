import { createAgentLedgerProxy } from '../../api/_agentledger-proxy.js';

const PROXY_PATH = '/api/agentledger/company-health';

function createMiddleware(origin) {
  const handleAgentLedgerProxy = createAgentLedgerProxy(origin);

  return async (request, response, next) => {
    if (!request.url || new URL(request.url, 'http://localhost').pathname !== PROXY_PATH) {
      next();
      return;
    }

    try {
      const headers = {};
      if (typeof request.headers['content-type'] === 'string') {
        headers['content-type'] = request.headers['content-type'];
      }
      const method = request.method || 'GET';
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = request;
        init.duplex = 'half';
      }
      const webRequest = new Request(`http://localhost${request.url}`, init);
      const webResponse = await handleAgentLedgerProxy(webRequest);
      response.statusCode = webResponse.status;
      webResponse.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await webResponse.arrayBuffer()));
    } catch {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(JSON.stringify({ error: 'AgentLedger proxy failed.' }));
    }
  };
}

export function agentLedgerProxyPlugin(origin) {
  const middleware = createMiddleware(origin);
  return {
    name: 'agentledger-same-origin-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
