const OWNER = "timmylistudio";
const REPO = "timmylistudio.github.io";
const BRANCH = "main";
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const AUTH_BASE = (window.HOMEPAGE_ADMIN_CONFIG?.authBaseUrl || "").replace(/\/$/, "");
const TOKEN_KEY = "timmylistudio-homepage-token";

let currentContent = null;
let contentSha = null;
let uploadedPhotoPath = "";
let signedIn = false;

const $ = (selector) => document.querySelector(selector);
const statusBox = $("#status");
const sessionStatus = $("#session-status");
const form = $("#editor");

function setStatus(message) {
  statusBox.textContent = message;
}

function setSession(message) {
  sessionStatus.textContent = message;
}

function setLoginControlsEnabled(enabled) {
  $("#login").disabled = !enabled;
  $("#logout").disabled = !enabled;
}

function requireAuthBase() {
  if (!AUTH_BASE) {
    throw new Error("Admin login is not configured yet. Set authBaseUrl in admin/config.js after deploying the Worker.");
  }
}

function token() {
  return $("#token")?.value.trim() || "";
}

function directHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token()}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function encodeBase64Unicode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64Unicode(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function slugify(value) {
  return String(value || "section")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

async function apiFetch(path, options = {}) {
  requireAuthBase();
  const response = await fetch(`${AUTH_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}

async function githubGet(path) {
  if (!signedIn && token()) {
    const response = await fetch(`${API_ROOT}/${path}?ref=${BRANCH}`, {
      headers: directHeaders()
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
    }
    return response.json();
  }

  return apiFetch(`/content?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(BRANCH)}`);
}

async function githubPut(path, content, message, sha) {
  if (!signedIn && token()) {
    const body = {
      branch: BRANCH,
      content,
      message
    };
    if (sha) body.sha = sha;

    const response = await fetch(`${API_ROOT}/${path}`, {
      method: "PUT",
      headers: {
        ...directHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
    }
    return response.json();
  }

  return apiFetch(`/content?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      branch: BRANCH,
      content,
      message,
      sha
    })
  });
}

function addLink(link = { label: "", url: "" }) {
  const node = $("#link-template").content.firstElementChild.cloneNode(true);
  node.querySelector('[data-link="label"]').value = link.label || "";
  node.querySelector('[data-link="url"]').value = link.url || "";
  node.querySelector("[data-remove]").addEventListener("click", () => node.remove());
  $("#links-list").append(node);
}

function addSection(section = { id: "", title: "", type: "paragraphs", items: [] }) {
  const node = $("#section-template").content.firstElementChild.cloneNode(true);
  node.querySelector('[data-section="id"]').value = section.id || slugify(section.title);
  node.querySelector('[data-section="title"]').value = section.title || "";
  node.querySelector('[data-section="type"]').value = section.type || "paragraphs";
  node.querySelector('[data-section="items"]').value = (section.items || []).join("\n");
  node.querySelector("[data-remove]").addEventListener("click", () => node.remove());
  $("#sections-list").append(node);
}

function fillEditor(content) {
  currentContent = content;
  form.elements.name.value = content.profile?.name || "";
  form.elements.email.value = content.profile?.email || "";
  form.elements.photo.value = content.profile?.photo || "";
  form.elements.lastUpdated.value = content.site?.lastUpdated || "";
  form.elements.version.value = content.site?.version || "";

  $("#links-list").innerHTML = "";
  (content.links || []).forEach(addLink);

  $("#sections-list").innerHTML = "";
  (content.sections || []).forEach(addSection);
}

function collectEditor() {
  const links = [...document.querySelectorAll("#links-list .item-row")]
    .map((row) => ({
      label: row.querySelector('[data-link="label"]').value.trim(),
      url: row.querySelector('[data-link="url"]').value.trim()
    }))
    .filter((link) => link.label && link.url);

  const sections = [...document.querySelectorAll("#sections-list .section-editor")]
    .map((row) => {
      const title = row.querySelector('[data-section="title"]').value.trim();
      const id = slugify(row.querySelector('[data-section="id"]').value || title);
      const type = row.querySelector('[data-section="type"]').value;
      const items = row
        .querySelector('[data-section="items"]')
        .value.split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      return { id, title, type, items };
    })
    .filter((section) => section.title && section.items.length);

  const name = form.elements.name.value.trim();
  const email = form.elements.email.value.trim();
  const photo = uploadedPhotoPath || form.elements.photo.value.trim();

  return {
    site: {
      title: name,
      description: `${name}'s personal homepage.`,
      lastUpdated: form.elements.lastUpdated.value.trim(),
      version: form.elements.version.value.trim()
    },
    profile: {
      name,
      email,
      photo,
      photoAlt: name
    },
    links,
    sections
  };
}

async function checkSession() {
  if (!AUTH_BASE) {
    signedIn = false;
    setLoginControlsEnabled(false);
    setSession("GitHub login setup required.");
    setStatus("Use the token editor for now. GitHub login needs an OAuth App client ID and secret before it can work.");
    return;
  }

  try {
    setLoginControlsEnabled(true);
    const session = await apiFetch("/session");
    signedIn = Boolean(session.authenticated);
    setSession(signedIn ? `Signed in as ${session.login}.` : "Not signed in.");
  } catch (error) {
    signedIn = false;
    setSession("Not signed in.");
  }
}

async function loadContent() {
  if (!signedIn && !token()) {
    setStatus("Sign in with GitHub or add a token first, then load content.");
    return;
  }

  setStatus("Loading content.json from GitHub...");
  const file = await githubGet("content.json");
  contentSha = file.sha;
  const content = JSON.parse(decodeBase64Unicode(file.content));
  fillEditor(content);
  setStatus("Loaded content.json.");
}

async function uploadPhotoIfNeeded() {
  const input = $("#photo-upload");
  if (!input.files.length) return "";

  const file = input.files[0];
  const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "jpg";
  const safeName = `profile-${Date.now()}.${extension}`;
  const path = `assets/uploads/${safeName}`;
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  setStatus(`Uploading ${file.name}...`);
  await githubPut(path, btoa(binary), `Upload ${safeName}`);
  uploadedPhotoPath = path;
  form.elements.photo.value = path;
  return path;
}

async function publish(event) {
  event.preventDefault();
  if (!signedIn && !token()) {
    setStatus("Sign in with GitHub or add a token first.");
    return;
  }

  try {
    if (!contentSha) {
      await loadContent();
    }
    await uploadPhotoIfNeeded();
    const nextContent = collectEditor();
    const json = `${JSON.stringify(nextContent, null, 2)}\n`;
    setStatus("Publishing content.json...");
    const result = await githubPut(
      "content.json",
      encodeBase64Unicode(json),
      `Update homepage content to version ${nextContent.site.version || "latest"}`,
      contentSha
    );
    contentSha = result.content.sha;
    currentContent = nextContent;
    setStatus("Published. GitHub Pages will update in about 30-60 seconds.");
  } catch (error) {
    setStatus(`Publish failed:\n${error.message}`);
  }
}

$("#login").addEventListener("click", () => {
  try {
    requireAuthBase();
    window.location.href = `${AUTH_BASE}/login?return_to=${encodeURIComponent(window.location.href)}`;
  } catch (error) {
    setStatus(error.message);
  }
});

$("#logout").addEventListener("click", async () => {
  try {
    await apiFetch("/logout", { method: "POST" });
    signedIn = false;
    setSession("Signed out.");
    setStatus("Signed out.");
  } catch (error) {
    setStatus(`Sign out failed:\n${error.message}`);
  }
});

$("#save-token").addEventListener("click", () => {
  localStorage.setItem(TOKEN_KEY, token());
  setStatus("Token saved in this browser.");
});

$("#forget-token").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  $("#token").value = "";
  setStatus("Token removed from this browser.");
});

$("#load-content").addEventListener("click", () => {
  loadContent().catch((error) => setStatus(`Load failed:\n${error.message}`));
});

$("#add-link").addEventListener("click", () => addLink());
$("#add-section").addEventListener("click", () => addSection());
form.addEventListener("submit", publish);

const savedToken = localStorage.getItem(TOKEN_KEY);
if (savedToken && $("#token")) {
  $("#token").value = savedToken;
}

fetch("../content.json", { cache: "no-store" })
  .then((response) => response.json())
  .then(fillEditor)
  .catch(() => {
    fillEditor({
      site: { lastUpdated: "", version: "" },
      profile: { name: "", email: "", photo: "" },
      links: [],
      sections: []
    });
  });

checkSession();
