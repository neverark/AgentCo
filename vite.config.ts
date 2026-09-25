import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { agentLedgerProxyPlugin } from './src/server/vite-agentledger-plugin.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const configuredOrigin = env.AGENTLEDGER_SERVICE_ORIGIN || 'https://agentledger-one.vercel.app';

  return {
    plugins: [react(), agentLedgerProxyPlugin(configuredOrigin)],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
