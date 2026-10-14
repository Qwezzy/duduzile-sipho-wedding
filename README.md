# Duduzile & Sipho wedding site

Static site (no build step). Edit the `SITE` block near the bottom of `index.html` to change details.

- `gallery.json` lists gallery photos (`{ "src": "photos/x.jpg", "alt": "..." }`). The current photos are Pexels placeholders.
- Set `preview: false` in `SITE` to remove the sample-details banner and sample RSVP prefill
- Deploys to Vercel as a static site on every push to `main`
