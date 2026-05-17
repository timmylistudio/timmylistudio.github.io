const COOKIE_NAME = "homepage_admin_session";
const ADMIN_COOKIE = "homepage_admin_access";
const STATE_COOKIE = "homepage_admin_state";
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";

function json(data, status = 200, env, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env),
      ...extraHeaders
    }
  });
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ADMIN_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"
  };
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function setCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signSession(value, env) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64Url(signature);
}

async function createAdminSession(env) {
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const payload = String(expires);
  const signature = await signSession(payload, env);
  return `${payload}.${signature}`;
}

async function verifyAdminSession(value, env) {
  if (!value || !env.SESSION_SECRET) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  const expected = await signSession(expires, env);
  return signature === expected;
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "timmylistudio-homepage-admin",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function getSession(request, env) {
  if (await verifyAdminSession(getCookie(request, ADMIN_COOKIE), env)) {
    if (!env.GITHUB_WRITE_TOKEN) {
      throw new Error("GITHUB_WRITE_TOKEN secret is not configured.");
    }
    return {
      login: env.ALLOWED_LOGIN || "admin",
      token: env.GITHUB_WRITE_TOKEN
    };
  }

  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;

  const user = await githubRequest("/user", token);
  if (env.ALLOWED_LOGIN && user.login !== env.ALLOWED_LOGIN) {
    throw new Error(`Signed in as ${user.login}, but only ${env.ALLOWED_LOGIN} can use this admin.`);
  }

  return {
    login: user.login,
    token
  };
}

async function handlePasswordLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || !env.GITHUB_WRITE_TOKEN) {
    return json({ error: "Password login is not configured." }, 500, env);
  }

  const body = await request.json();
  if (body.password !== env.ADMIN_PASSWORD) {
    return json({ error: "Invalid password." }, 401, env);
  }

  return json(
    { ok: true },
    200,
    env,
    { "Set-Cookie": setCookie(ADMIN_COOKIE, await createAdminSession(env), 60 * 60 * 24 * 14) }
  );
}

async function handleLogin(request, env) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to") || env.ADMIN_ORIGIN;
  const state = randomState();
  const redirectUri = `${url.origin}/callback`;
  const authorize = new URL(GITHUB_AUTHORIZE_URL);

  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "public_repo read:user");
  authorize.searchParams.set("state", `${state}.${encodeURIComponent(returnTo)}`);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": setCookie(STATE_COOKIE, state, 600)
    }
  });
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") || "";
  const storedState = getCookie(request, STATE_COOKIE);
  const separatorIndex = stateParam.indexOf(".");
  const state = separatorIndex >= 0 ? stateParam.slice(0, separatorIndex) : "";
  const returnTo =
    separatorIndex >= 0 ? decodeURIComponent(stateParam.slice(separatorIndex + 1)) : env.ADMIN_ORIGIN;

  if (!code || !state || state !== storedState) {
    return new Response("Invalid GitHub login state.", { status: 400 });
  }

  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code
    })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    return new Response("GitHub login failed.", { status: 400 });
  }

  const user = await githubRequest("/user", tokenData.access_token);
  if (env.ALLOWED_LOGIN && user.login !== env.ALLOWED_LOGIN) {
    return new Response(`Signed in as ${user.login}; expected ${env.ALLOWED_LOGIN}.`, { status: 403 });
  }

  const headers = new Headers({ Location: returnTo });
  headers.append("Set-Cookie", setCookie(COOKIE_NAME, tokenData.access_token, 60 * 60 * 24 * 14));
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE));

  return new Response(null, {
    status: 302,
    headers
  });
}

async function handleContent(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Not signed in" }, 401, env);

  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path || path.includes("..")) {
    return json({ error: "Invalid path" }, 400, env);
  }

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const apiPath = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodedPath}`;

  if (request.method === "GET") {
    const ref = url.searchParams.get("ref") || "main";
    const data = await githubRequest(`${apiPath}?ref=${encodeURIComponent(ref)}`, session.token);
    return json(data, 200, env);
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const data = await githubRequest(apiPath, session.token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return json(data, 200, env);
  }

  return json({ error: "Method not allowed" }, 405, env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/login") return handleLogin(request, env);
      if (url.pathname === "/callback") return handleCallback(request, env);
      if (url.pathname === "/password-login") return handlePasswordLogin(request, env);
      if (url.pathname === "/session") {
        const session = await getSession(request, env);
        return json({ authenticated: Boolean(session), login: session?.login || null }, 200, env);
      }
      if (url.pathname === "/logout") {
        const headers = new Headers(corsHeaders(env));
        headers.set("Content-Type", "application/json");
        headers.append("Set-Cookie", clearCookie(COOKIE_NAME));
        headers.append("Set-Cookie", clearCookie(ADMIN_COOKIE));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }
      if (url.pathname === "/content") return handleContent(request, env);

      return json({ error: "Not found" }, 404, env);
    } catch (error) {
      return json({ error: error.message }, 500, env);
    }
  }
};
