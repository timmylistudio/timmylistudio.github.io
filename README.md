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

The admin portal supports GitHub login through the Cloudflare Worker in
`worker/`. Create a GitHub OAuth App, deploy the Worker, set the Worker URL in
`admin/config.js`, then use "Sign in with GitHub" on `/admin/`.

GitHub OAuth App settings:

- Homepage URL: `https://timmylistudio.github.io/admin/`
- Authorization callback URL: `https://<your-worker-url>/callback`

Worker setup:

```bash
cd worker
wrangler secret put GITHUB_CLIENT_SECRET
wrangler deploy
```

Before deploying for the first time, register a `workers.dev` subdomain for the
Cloudflare account. Set `GITHUB_CLIENT_ID` in `worker/wrangler.toml`, put the
OAuth app secret into `GITHUB_CLIENT_SECRET`, deploy the Worker, then put the
deployed Worker URL in `admin/config.js`.
- Push this repo to `https://github.com/timmylistudio/timmylistudio.github.io`.

GitHub Pages will serve the site from the repository's configured Pages branch.
