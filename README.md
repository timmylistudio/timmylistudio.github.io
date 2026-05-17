# timmyli.github.io

Static personal homepage for GitHub Pages.

## Local preview

Open `index.html` in a browser, or run a tiny local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Personalization checklist

- Update the bio and interests as your profile changes.
- Add project, publication, or resume links when they are ready.
- Keep the footer's last-updated version current.

## Admin portal

Visit `/admin/` on the published site to edit homepage content.

The admin portal supports password login through the Cloudflare Worker in
`worker/`. The Worker stores the GitHub write token as a Cloudflare secret, so
the public admin page does not need to ask for a GitHub token during normal use.
The browser stores a short signed admin session after login, avoiding
third-party cookie issues.

Worker setup:

```bash
cd worker
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
wrangler secret put GITHUB_WRITE_TOKEN
wrangler deploy
```

The deployed Worker URL is configured in `admin/config.js`.
- Push this repo to `https://github.com/timmylistudio/timmylistudio.github.io`.

GitHub Pages will serve the site from the repository's configured Pages branch.
