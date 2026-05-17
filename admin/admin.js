const OWNER = "timmylistudio";
const REPO = "timmylistudio.github.io";
const BRANCH = "main";
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const TOKEN_KEY = "timmylistudio-homepage-token";

let currentContent = null;
let contentSha = null;
let uploadedPhotoPath = "";

const $ = (selector) => document.querySelector(selector);
const statusBox = $("#status");
const form = $("#editor");

function setStatus(message) {
  statusBox.textContent = message;
}

function token() {
  return $("#token").value.trim();
}

function headers() {
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

async function githubGet(path) {
  const response = await fetch(`${API_ROOT}/${path}?ref=${BRANCH}`, {
    headers: headers()
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}

async function githubPut(path, content, message, sha) {
  const body = {
    message,
    content,
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const response = await fetch(`${API_ROOT}/${path}`, {
    method: "PUT",
    headers: {
      ...headers(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
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

async function loadContent() {
  if (!token()) {
    setStatus("Add a GitHub token first.");
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
  if (!token()) {
    setStatus("Add a GitHub token first.");
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
if (savedToken) {
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
