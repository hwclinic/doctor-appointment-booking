/* ==========================================================================
   CORS helper.
   Beginner note: "CORS" (Cross-Origin Resource Sharing) is the browser's
   safety rule that stops a website from calling a different website's API
   unless that API explicitly allows it. Our Worker lives on a different
   address than our GitHub Pages website, so we must add these headers to
   every response, or the browser will block the request.
   ========================================================================== */

export function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function jsonResponse(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env),
    },
  });
}

export function handleOptions(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}
