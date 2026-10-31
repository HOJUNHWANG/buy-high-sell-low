// Keep the retired scheduler endpoint inert while external jobs are removed.
// No database client, authentication secret, or market-generation code is used.
function retired() {
  return new Response(null, {
    status: 410,
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}

export const GET = retired;
export const POST = retired;
