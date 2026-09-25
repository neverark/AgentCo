export function localPaymentUnavailable() {
  return new Response(JSON.stringify({
    error: 'Paid provider execution requires the local Onchain OS CLI wallet runtime. Hosted serverless execution is disabled.',
  }), {
    status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
