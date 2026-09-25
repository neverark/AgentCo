import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runOnchainos(args) {
  const { stdout } = await execFileAsync('onchainos', args, {
    timeout: 8_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return JSON.parse(stdout.trim());
}

function dataOf(result) {
  return result && typeof result === 'object' && !Array.isArray(result)
    ? (result.data && typeof result.data === 'object' ? result.data : result)
    : {};
}

function readyOf(value) {
  return value === true || value?.ok === true;
}

export function createWalletStatusHandler(run = runOnchainos) {
  return async function handler(request) {
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers });
    try {
      const wallet = dataOf(await run(['wallet', 'status']));
      const loggedIn = wallet.loggedIn === true;
      if (!loggedIn) {
        return new Response(JSON.stringify({ available: true, walletLoggedIn: false, okxUserReady: false }), { headers });
      }
      const gate = dataOf(await run(['agent', 'gate-check', '--role', 'user']));
      return new Response(JSON.stringify({
        available: true,
        walletLoggedIn: true,
        okxUserReady: gate.ready === true,
        checks: {
          wallet: readyOf(gate.wallet),
          identity: readyOf(gate.identity),
          communication: readyOf(gate.communication),
        },
      }), { headers });
    } catch (error) {
      const missing = error?.code === 'ENOENT';
      return new Response(JSON.stringify({
        available: !missing,
        walletLoggedIn: false,
        okxUserReady: false,
        error: missing ? 'Install the Onchain OS CLI to check the Agentic Wallet session.' : 'The Onchain OS session check could not be completed.',
      }), { status: missing ? 200 : 502, headers });
    }
  };
}
