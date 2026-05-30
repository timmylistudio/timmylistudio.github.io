const COOKIE_NAME = "homepage_admin_session";
const STATE_COOKIE = "homepage_admin_state";
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";
const ANALYTICS_STATS_KEY = "analytics:stats";
const ANALYTICS_ARCHIVE_INDEX_KEY = "analytics:archive:index";
const ANALYTICS_ARCHIVE_PREFIX = "analytics/archive/";
const ANALYTICS_EVENT_LIMIT = 500;

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
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS"
  };
}

function trimText(value, maxLength = 180) {
  return String(value || "").trim().slice(0, maxLength);
}

function safePath(value) {
  const path = trimText(value || "/", 240);
  return path.startsWith("/") ? path : "/";
}

function safeReferrer(value) {
  const referrer = trimText(value, 400);
  if (!referrer) return "";

  try {
    const url = new URL(referrer);
    return `${url.origin}${url.pathname}`;
  } catch (error) {
    return "";
  }
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function browserFromUserAgent(userAgent) {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) return "Safari";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  return "Unknown";
}

function deviceFromUserAgent(userAgent) {
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return "Mobile";
  if (/iPad|Tablet/i.test(userAgent)) return "Tablet";
  return "Desktop";
}

async function analyticsJson(env, key, fallback) {
  if (!env.ANALYTICS) return fallback;

  const value = await env.ANALYTICS.get(key);
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function incrementMapValue(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function limitObjectKeys(object, maxKeys) {
  const entries = Object.entries(object || {});
  if (entries.length <= maxKeys) return object || {};
  return Object.fromEntries(entries.slice(entries.length - maxKeys));
}

function analyticsArchiveKey(day) {
  return `${ANALYTICS_ARCHIVE_PREFIX}${day}`;
}

function safeDateKey(value, fallback) {
  const date = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
}

function dateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function updateArchiveIndex(index, day) {
  const days = Array.isArray(index) ? index : [];
  return [day, ...days.filter((item) => item !== day)].slice(0, 365);
}

function getBearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
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

function safeReturnTo(value, env) {
  try {
    const url = new URL(value || env.ADMIN_ORIGIN);
    if (url.origin === env.ADMIN_ORIGIN) return url.toString();
  } catch (error) {
    // Fall through to the admin origin below.
  }
  return `${env.ADMIN_ORIGIN}/admin/`;
}

function withSessionFragment(returnTo, token, login) {
  const url = new URL(returnTo);
  url.hash = new URLSearchParams({
    admin_session: token,
    login
  }).toString();
  return url.toString();
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
  const token = getBearerToken(request) || getCookie(request, COOKIE_NAME);
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

async function handleLogin(request, env) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response("GitHub OAuth client ID is not configured.", { status: 500 });
  }

  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"), env);
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
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return new Response("GitHub OAuth client ID or secret is not configured.", { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") || "";
  const storedState = getCookie(request, STATE_COOKIE);
  const separatorIndex = stateParam.indexOf(".");
  const state = separatorIndex >= 0 ? stateParam.slice(0, separatorIndex) : "";
  const returnTo =
    separatorIndex >= 0
      ? safeReturnTo(decodeURIComponent(stateParam.slice(separatorIndex + 1)), env)
      : `${env.ADMIN_ORIGIN}/admin/`;

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

  const headers = new Headers({
    Location: withSessionFragment(returnTo, tokenData.access_token, user.login)
  });
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

async function handleTrack(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, env);
  }

  const origin = request.headers.get("Origin");
  if (origin && origin !== env.ADMIN_ORIGIN) {
    return json({ error: "Origin not allowed" }, 403, env);
  }

  if (!env.ANALYTICS) {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (error) {
    body = {};
  }

  const now = new Date();
  const day = dateKey(now, env.ANALYTICS_TIMEZONE || "America/New_York");
  const userAgent = trimText(request.headers.get("User-Agent"), 320);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const salt = env.TRACKING_SALT || env.GITHUB_CLIENT_SECRET || "homepage-tracking";
  const clientVisitorId = trimText(body.visitorId, 80);
  const visitorHash = await sha256Hex(`${ip}|${userAgent}|${clientVisitorId}|${salt}`);
  const visitor = visitorHash.slice(0, 12);
  const country = trimText(request.cf?.country || "", 80);
  const region = trimText(request.cf?.region || "", 80);
  const city = trimText(request.cf?.city || "", 80);

  const event = {
    id: crypto.randomUUID(),
    at: now.toISOString(),
    visitor,
    path: safePath(body.path),
    referrer: safeReferrer(body.referrer),
    country,
    region,
    city,
    timezone: trimText(body.timezone || request.cf?.timezone || "", 80),
    language: trimText(body.language, 80),
    screen: trimText(body.screen, 40),
    browser: browserFromUserAgent(userAgent),
    device: deviceFromUserAgent(userAgent)
  };

  const [dayEvents, archiveIndex, stats] = await Promise.all([
    analyticsJson(env, analyticsArchiveKey(day), []),
    analyticsJson(env, ANALYTICS_ARCHIVE_INDEX_KEY, []),
    analyticsJson(env, ANALYTICS_STATS_KEY, {
      total: 0,
      days: {},
      paths: {},
      referrers: {},
      visitors: {}
    })
  ]);

  const nextDayEvents = [event, ...dayEvents].slice(0, ANALYTICS_EVENT_LIMIT);
  const nextArchiveIndex = updateArchiveIndex(archiveIndex, day);
  const visitors = stats.visitors || {};
  const visitorStats = visitors[visitor] || {
    firstSeen: event.at,
    count: 0
  };
  visitorStats.count += 1;
  visitorStats.lastSeen = event.at;
  visitorStats.country = country || visitorStats.country || "";
  visitorStats.region = region || visitorStats.region || "";
  visitorStats.city = city || visitorStats.city || "";
  visitorStats.device = event.device;
  visitorStats.browser = event.browser;
  visitors[visitor] = visitorStats;

  const nextStats = {
    total: (stats.total || 0) + 1,
    days: { ...(stats.days || {}) },
    paths: { ...(stats.paths || {}) },
    referrers: { ...(stats.referrers || {}) },
    visitors: limitObjectKeys(visitors, 1000)
  };
  incrementMapValue(nextStats.days, day);
  incrementMapValue(nextStats.paths, event.path);
  incrementMapValue(nextStats.referrers, event.referrer || "Direct");
  nextStats.days = limitObjectKeys(nextStats.days, 90);
  nextStats.paths = limitObjectKeys(nextStats.paths, 100);
  nextStats.referrers = limitObjectKeys(nextStats.referrers, 100);

  await Promise.all([
    env.ANALYTICS.put(analyticsArchiveKey(day), JSON.stringify(nextDayEvents)),
    env.ANALYTICS.put(ANALYTICS_ARCHIVE_INDEX_KEY, JSON.stringify(nextArchiveIndex)),
    env.ANALYTICS.put(ANALYTICS_STATS_KEY, JSON.stringify(nextStats))
  ]);

  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

async function handleAnalytics(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Not signed in" }, 401, env);

  const url = new URL(request.url);
  const today = dateKey(new Date(), env.ANALYTICS_TIMEZONE || "America/New_York");
  const selectedDate = safeDateKey(url.searchParams.get("date"), today);
  if (!env.ANALYTICS) {
    return json(
      {
        configured: false,
        date: selectedDate,
        today,
        dates: [],
        summary: { total: 0, uniqueVisitors: 0, today: 0, selectedDate: 0 },
        recent: []
      },
      200,
      env
    );
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), ANALYTICS_EVENT_LIMIT);
  const [events, archiveIndex, stats] = await Promise.all([
    analyticsJson(env, analyticsArchiveKey(selectedDate), []),
    analyticsJson(env, ANALYTICS_ARCHIVE_INDEX_KEY, []),
    analyticsJson(env, ANALYTICS_STATS_KEY, { total: 0, days: {}, paths: {}, referrers: {}, visitors: {} })
  ]);
  const dates = updateArchiveIndex(archiveIndex, today);

  return json(
    {
      configured: true,
      date: selectedDate,
      today,
      dates,
      summary: {
        total: stats.total || 0,
        uniqueVisitors: Object.keys(stats.visitors || {}).length,
        today: stats.days?.[today] || 0,
        selectedDate: stats.days?.[selectedDate] || events.length
      },
      recent: events.slice(0, limit),
      topPaths: Object.entries(stats.paths || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([path, count]) => ({ path, count })),
      topReferrers: Object.entries(stats.referrers || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([referrer, count]) => ({ referrer, count }))
    },
    200,
    env
  );
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
      if (url.pathname === "/session") {
        let session = null;
        let sessionError = null;
        try {
          session = await getSession(request, env);
        } catch (error) {
          sessionError = error.message;
        }
        return json(
          {
            authenticated: Boolean(session),
            login: session?.login || null,
            oauthConfigured: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
            sessionError
          },
          200,
          env
        );
      }
      if (url.pathname === "/logout") {
        const headers = new Headers(corsHeaders(env));
        headers.set("Content-Type", "application/json");
        headers.append("Set-Cookie", clearCookie(COOKIE_NAME));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }
      if (url.pathname === "/content") return handleContent(request, env);
      if (url.pathname === "/track") return handleTrack(request, env);
      if (url.pathname === "/analytics") return handleAnalytics(request, env);

      return json({ error: "Not found" }, 404, env);
    } catch (error) {
      return json({ error: error.message }, 500, env);
    }
  }
};
