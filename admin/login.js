const AUTH_BASE = (window.HOMEPAGE_ADMIN_CONFIG?.authBaseUrl || "").replace(/\/$/, "");
const SESSION_STORAGE_KEY = "timmylistudio_admin_session";
const LOGIN_STORAGE_KEY = "timmylistudio_admin_login";

let oauthConfigured = false;

const $ = (selector) => document.querySelector(selector);
const statusBox = $("#status");
const sessionStatus = $("#session-status");
const githubLoginButton = $("#github-login");

function setStatus(message) {
  statusBox.textContent = message;
}

function setSession(message) {
  sessionStatus.textContent = message;
}

function editorUrl() {
  return new URL("editor.html", window.location.href);
}

function getStoredSessionToken() {
  return localStorage.getItem(SESSION_STORAGE_KEY) || "";
}

function storeSession(token, login) {
  localStorage.setItem(SESSION_STORAGE_KEY, token);
  if (login) localStorage.setItem(LOGIN_STORAGE_KEY, login);
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(LOGIN_STORAGE_KEY);
}

function captureOAuthSessionFromUrl() {
  if (!window.location.hash) return false;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("admin_session");
  if (!token) return false;

  storeSession(token, params.get("login") || "");
  window.location.replace(editorUrl().toString());
  return true;
}

function requireAuthBase() {
  if (!AUTH_BASE) {
    throw new Error("GitHub OAuth login is not configured.");
  }
}

async function apiFetch(path) {
  requireAuthBase();
  const token = getStoredSessionToken();
  const response = await fetch(`${AUTH_BASE}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}

async function checkSession() {
  if (!AUTH_BASE) {
    githubLoginButton.disabled = true;
    setSession("GitHub OAuth is not configured.");
    setStatus("The backend auth URL is missing.");
    return;
  }

  try {
    const session = await apiFetch("/session");
    oauthConfigured = Boolean(session.oauthConfigured);

    if (!oauthConfigured) {
      githubLoginButton.disabled = true;
      setSession("GitHub OAuth is not configured.");
      setStatus("Add the GitHub OAuth App client ID and secret to the Worker.");
      return;
    }

    if (session.authenticated) {
      setSession(`Signed in as ${session.login}.`);
      setStatus("Opening admin portal...");
      window.location.replace(editorUrl().toString());
      return;
    }

    clearStoredSession();
    githubLoginButton.disabled = false;
    setSession("Not signed in.");
    setStatus("");
  } catch (error) {
    clearStoredSession();
    oauthConfigured = Boolean(AUTH_BASE);
    githubLoginButton.disabled = false;
    setSession("Not signed in.");
    setStatus("");
  }
}

function githubLogin() {
  if (!oauthConfigured) {
    setStatus("GitHub OAuth App is not configured yet.");
    return;
  }

  try {
    requireAuthBase();
    const returnUrl = editorUrl();
    returnUrl.hash = "";
    window.location.href = `${AUTH_BASE}/login?return_to=${encodeURIComponent(returnUrl.toString())}`;
  } catch (error) {
    setStatus(error.message);
  }
}

githubLoginButton.disabled = true;
githubLoginButton.addEventListener("click", githubLogin);

if (!captureOAuthSessionFromUrl()) {
  checkSession();
}
