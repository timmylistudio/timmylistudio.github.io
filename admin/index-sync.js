(function initIndexSync(global) {
  const SITE_ORIGIN = "https://timmylistudio.github.io";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function safeHtml(value) {
    return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son[a-z]+="[^"]*"/gi, "")
      .replace(/\son[a-z]+='[^']*'/gi, "")
      .replace(/\sjavascript:/gi, "");
  }

  function normalizeEmails(profile) {
    const emails = Array.isArray(profile?.emails)
      ? profile.emails
      : String(profile?.email || "").split(/\r?\n/);

    return emails.map((item) => String(item || "").trim()).filter(Boolean);
  }

  function absoluteAsset(path) {
    const value = String(path || "").trim();
    if (!value) return `${SITE_ORIGIN}/`;
    if (/^https?:\/\//i.test(value)) return value;
    return `${SITE_ORIGIN}/${value.replace(/^\//, "")}`;
  }

  function mailtoFromEmail(value) {
    const email = String(value || "")
      .trim()
      .replace(/\s*\[at\]\s*/gi, "@")
      .replace(/\s*\(at\)\s*/gi, "@");
    return email.includes("@") ? `mailto:${email}` : "";
  }

  function splitName(name) {
    const clean = String(name || "").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    return {
      first: parts[0] || clean,
      last: parts.length > 1 ? parts[parts.length - 1] : clean
    };
  }

  function setMeta(doc, attribute, key, value) {
    const node = doc.querySelector(`meta[${attribute}="${key}"]`);
    if (node) node.setAttribute("content", value);
  }

  function linkIcon(link) {
    const label = String(link?.label || "").toLowerCase();
    const url = String(link?.url || "").toLowerCase();

    if (label.includes("github") || url.includes("github.com")) {
      return '<svg class="link-icon icon-github" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.63 2.29 6.7 5.47 7.79.4.08.55-.18.55-.39 0-.19-.01-.84-.01-1.53-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.15-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.84.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.09-1.78-.21-3.64-.91-3.64-4.03 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.38 7.38 0 0 1 8 4.01c.68 0 1.36.09 2 .28 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.13-1.87 3.82-3.65 4.03.29.26.54.75.54 1.52 0 1.09-.01 1.97-.01 2.24 0 .21.15.47.55.39A8.15 8.15 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z"></path></svg>';
    }
    if (label.includes("linkedin") || url.includes("linkedin.com")) {
      return '<svg class="link-icon icon-linkedin" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.15 0h13.7C15.49 0 16 .51 16 1.15v13.7c0 .64-.51 1.15-1.15 1.15H1.15C.51 16 0 15.49 0 14.85V1.15C0 .51.51 0 1.15 0Zm3.63 13.39V6.16H2.38v7.23h2.4ZM3.58 5.17c.84 0 1.36-.56 1.36-1.25-.02-.71-.52-1.25-1.34-1.25-.82 0-1.36.54-1.36 1.25 0 .69.52 1.25 1.32 1.25h.02Zm10.03 8.22V9.24c0-2.22-1.18-3.25-2.76-3.25-1.27 0-1.84.7-2.16 1.2V6.16H6.29c.03.68 0 7.23 0 7.23h2.4V9.35c0-.22.02-.43.08-.59.17-.43.56-.88 1.21-.88.85 0 1.19.65 1.19 1.6v3.91h2.44Z"></path></svg>';
    }
    if (label.includes("weibo") || url.includes("weibo.com")) {
      return '<svg class="link-icon icon-weibo" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.24 13.98C3.19 13.98.8 12.45.8 10.34c0-1.41 1.08-2.63 2.66-3.23.47-.18.54-.3.55-.67.03-1.18.82-2.07 1.92-2.07.54 0 1.05.2 1.45.54.31.27.45.27.81.11.38-.17.79-.26 1.21-.26 1.45 0 2.57 1.05 2.57 2.41 0 .3-.05.59-.16.86 1.06.55 1.69 1.36 1.69 2.31 0 2.11-2.37 3.64-7.26 3.64Zm-.08-1.44c2.67 0 4.63-.98 4.63-2.36 0-1.39-1.96-2.37-4.63-2.37-2.66 0-4.62.98-4.62 2.37 0 1.38 1.96 2.36 4.62 2.36Zm-1.58-1.27a.92.92 0 1 1 0-1.84.92.92 0 0 1 0 1.84Zm3.01-.28a1.16 1.16 0 1 1 0-2.32 1.16 1.16 0 0 1 0 2.32Zm5.1-5.64a.55.55 0 0 1-.53-.43 2.8 2.8 0 0 0-2.16-2.14.55.55 0 0 1 .24-1.07 3.9 3.9 0 0 1 3 2.98.55.55 0 0 1-.55.66Zm1.9-1.05a.55.55 0 0 1-.53-.43A4.8 4.8 0 0 0 10.4.31a.55.55 0 1 1 .23-1.07 5.9 5.9 0 0 1 4.49 4.39.55.55 0 0 1-.53.67Z"></path></svg>';
    }
    if (label.includes("michigan") || url.includes("michiganross.umich.edu")) {
      return '<span class="link-icon icon-michigan" aria-hidden="true">M</span>';
    }
    return "";
  }

  function renderStaticLinks(links) {
    return (links || [])
      .map(
        (link) =>
          `<a class="social-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${linkIcon(link)}<span>${escapeHtml(link.label)}</span></a>`
      )
      .join('<span class="link-separator">/</span>');
  }

  function renderStaticEmails(emails) {
    return emails.map((item) => `<span class="email-item">${escapeHtml(item)}</span>`).join("");
  }

  function renderStaticNav(sections) {
    return (sections || [])
      .map((section) => `[<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>]`)
      .join(" ");
  }

  function renderStaticSection(section) {
    const items = Array.isArray(section.items) ? section.items : [];
    const content =
      section.type === "list"
        ? `<ul>${items.map((item) => `<li>${safeHtml(item)}</li>`).join("")}</ul>`
        : items.map((item) => `<p>${safeHtml(item)}</p>`).join("");

    return `
        <section id="${escapeHtml(section.id)}">
          <h2>${escapeHtml(section.title)}</h2>
          ${content}
        </section>`;
  }

  function buildPersonJsonLd(content) {
    const profile = content.profile || {};
    const site = content.site || {};
    const emails = normalizeEmails(profile);
    const payload = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: profile.name || site.title || "Timmy Li",
      description: site.description || "",
      url: `${SITE_ORIGIN}/`,
      image: absoluteAsset(profile.photo),
      sameAs: (content.links || []).map((link) => link.url).filter(Boolean)
    };

    const email = mailtoFromEmail(emails[0] || profile.email);
    if (email) payload.email = email;

    return payload;
  }

  function buildWebSiteJsonLd(content) {
    const profile = content.profile || {};
    const site = content.site || {};

    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: site.title || profile.name || "Timmy Li",
      url: `${SITE_ORIGIN}/`,
      author: {
        "@type": "Person",
        name: profile.name || site.title || "Timmy Li"
      }
    };
  }

  function syncIndexHtml(html, content) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const profile = content.profile || {};
    const site = content.site || {};
    const title = site.title || profile.name || "Timmy Li";
    const description = site.description || `${title}'s personal homepage.`;
    const photo = String(profile.photo || "").trim();
    const photoAlt = profile.photoAlt || profile.name || title;
    const photoUrl = absoluteAsset(photo);
    const emails = normalizeEmails(profile);
    const nameParts = splitName(profile.name || title);

    doc.title = title;
    setMeta(doc, "name", "description", description);
    setMeta(doc, "name", "author", profile.name || title);
    setMeta(doc, "name", "keywords", `${title}, personal homepage`);
    setMeta(doc, "property", "og:site_name", profile.name || title);
    setMeta(doc, "property", "og:title", title);
    setMeta(doc, "property", "og:description", description);
    setMeta(doc, "property", "og:image", photoUrl);
    setMeta(doc, "property", "og:image:alt", photoAlt);
    setMeta(doc, "property", "profile:first_name", nameParts.first);
    setMeta(doc, "property", "profile:last_name", nameParts.last);
    setMeta(doc, "name", "twitter:title", title);
    setMeta(doc, "name", "twitter:description", description);
    setMeta(doc, "name", "twitter:image", photoUrl);
    setMeta(doc, "name", "twitter:image:alt", photoAlt);

    const preload = doc.querySelector('link[rel="preload"][as="image"]');
    if (preload && photo) preload.setAttribute("href", photo);

    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    if (jsonLdScripts[0]) {
      jsonLdScripts[0].textContent = `\n    ${JSON.stringify(buildPersonJsonLd(content), null, 2).replace(/\n/g, "\n    ")}\n    `;
    }
    if (jsonLdScripts[1]) {
      jsonLdScripts[1].textContent = `\n    ${JSON.stringify(buildWebSiteJsonLd(content), null, 2).replace(/\n/g, "\n    ")}\n    `;
    }

    const nameNode = doc.querySelector('[data-field="name"]');
    if (nameNode) nameNode.textContent = profile.name || title;

    const emailNode = doc.querySelector('[data-field="email"]');
    if (emailNode) emailNode.innerHTML = renderStaticEmails(emails);

    const linksNode = doc.querySelector('[data-field="links"]');
    if (linksNode) linksNode.innerHTML = renderStaticLinks(content.links || []);

    const navNode = doc.querySelector('[data-field="nav"]');
    if (navNode) navNode.innerHTML = renderStaticNav(content.sections || []);

    const sectionsNode = doc.querySelector('[data-field="sections"]');
    if (sectionsNode) {
      sectionsNode.innerHTML = (content.sections || []).map(renderStaticSection).join("\n");
    }

    const photoNode = doc.querySelector('[data-field="photo"]');
    if (photoNode && photo) {
      photoNode.setAttribute("src", photo);
      photoNode.setAttribute("alt", photoAlt);
      photoNode.hidden = false;
    }

    const footer = doc.querySelector('[data-field="footer"]');
    if (footer) {
      const adminLink = footer.querySelector(".admin-link");
      footer.innerHTML = `<span>Last updated: ${escapeHtml(site.lastUpdated || "")} &nbsp;|&nbsp; Version ${escapeHtml(site.version || "")}</span>`;
      if (adminLink) {
        footer.append(adminLink);
      } else {
        footer.insertAdjacentHTML(
          "beforeend",
          '<a class="admin-link" href="admin/" target="_blank" rel="noopener noreferrer" aria-label="Open admin editor">Admin</a>'
        );
      }
    }

    return `<!doctype html>\n${doc.documentElement.outerHTML}\n`;
  }

  global.syncIndexHtml = syncIndexHtml;
})(window);
