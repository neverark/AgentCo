import { createOnchainTokenHandler } from '../../api/_onchain-token.js';
import { createWalletStatusHandler } from './okx-wallet-status.js';

const TOKEN_PATH = '/api/onchainos/token-basic-info';
const WALLET_PATH = '/api/okx/wallet-status';

export function okxIntegrationPlugin(env) {
  const tokenHandler = createOnchainTokenHandler({ env });
  const walletHandler = createWalletStatusHandler();
  const middleware = async (request, response, next) => {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    const handler = path === TOKEN_PATH ? tokenHandler : path === WALLET_PATH ? walletHandler : null;
    if (!handler) return next();
    try {
      const method = request.method || 'GET';
      const headers = {};
      if (typeof request.headers['content-type'] === 'string') headers['content-type'] = request.headers['content-type'];
      if (typeof request.headers['content-length'] === 'string') headers['content-length'] = request.headers['content-length'];
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = request;
        init.duplex = 'half';
      }
      const result = await handler(new Request(`http://localhost${request.url}`, init));
      response.statusCode = result.status;
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'OKX integration request failed.' }));
    }
  };
  return {
    name: 'okx-integrations',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
