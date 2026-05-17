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

The admin portal supports GitHub OAuth login through the Cloudflare Worker in
`worker/`. The public admin page does not accept password or token fallback
login.

Worker setup:

```bash
cd worker
wrangler secret put GITHUB_CLIENT_SECRET
wrangler deploy
```

Set `GITHUB_CLIENT_ID` in `worker/wrangler.toml`, store the OAuth app secret as
`GITHUB_CLIENT_SECRET`, and make sure the OAuth app callback URL is:

`https://timmylistudio-homepage-auth.timmylistudio.workers.dev/callback`
- Push this repo to `https://github.com/timmylistudio/timmylistudio.github.io`.

GitHub Pages will serve the site from the repository's configured Pages branch.
