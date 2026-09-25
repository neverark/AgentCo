export default function handler(request) {
  return new Response(JSON.stringify({
    available: false,
    walletLoggedIn: false,
    okxUserReady: false,
    error: 'Agentic Wallet session checks run with the local Onchain OS CLI.',
  }), {
    status: request.method === 'GET' ? 200 : 405,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
