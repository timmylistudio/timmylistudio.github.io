(async function loadContent() {
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const safeHtml = (value) =>
    String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son[a-z]+="[^"]*"/gi, "")
      .replace(/\son[a-z]+='[^']*'/gi, "")
      .replace(/\sjavascript:/gi, "");

  const renderInlineLinks = (links) =>
    links
      .map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`)
      .join(" / ");

  const renderNav = (sections) =>
    sections
      .map((section) => `[<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>]`)
      .join(" ");

  const renderSection = (section) => {
    const items = Array.isArray(section.items) ? section.items : [];
    const content =
      section.type === "list"
        ? `<ul>${items.map((item) => `<li>${safeHtml(item)}</li>`).join("")}</ul>`
        : items.map((item) => `<p>${safeHtml(item)}</p>`).join("");

    return `
      <section id="${escapeHtml(section.id)}">
        <h2>${escapeHtml(section.title)}</h2>
        ${content}
      </section>
    `;
  };

  const makeLinksOpenInNewTabs = () => {
    document.querySelectorAll('a[href]:not([href^="#"])').forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  };

  try {
    const response = await fetch(`content.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load content.json");
    }

    const content = await response.json();
    const name = document.querySelector('[data-field="name"]');
    const email = document.querySelector('[data-field="email"]');
    const links = document.querySelector('[data-field="links"]');
    const nav = document.querySelector('[data-field="nav"]');
    const sections = document.querySelector('[data-field="sections"]');
    const footer = document.querySelector('[data-field="footer"]');
    const photo = document.querySelector('[data-field="photo"]');

    document.title = content.site?.title || content.profile?.name || document.title;
    if (name) name.textContent = content.profile?.name || "";
    if (email) {
      email.textContent = content.profile?.email || "";
    }
    if (links) links.innerHTML = renderInlineLinks(content.links || []);
    if (nav) nav.innerHTML = renderNav(content.sections || []);
    if (sections) sections.innerHTML = (content.sections || []).map(renderSection).join("");
    if (footer) {
      footer.innerHTML = `Last updated: ${escapeHtml(content.site?.lastUpdated || "")} &nbsp;|&nbsp; Version ${escapeHtml(content.site?.version || "")}`;
    }
    if (photo && content.profile?.photo) {
      photo.src = content.profile.photo;
      photo.alt = content.profile.photoAlt || content.profile.name || "";
      photo.hidden = false;
    }
    makeLinksOpenInNewTabs();
  } catch (error) {
    console.warn(error);
    makeLinksOpenInNewTabs();
  }
})();
