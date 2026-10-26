# Duduzile & Sipho wedding site

Static site (no build step). Edit the `SITE` block near the bottom of `index.html` to change details.

- `gallery.json` lists gallery photos (`{ "src": "photos/x.jpg", "alt": "..." }`). The current photos are Pexels placeholders.
- Set `preview: false` in `SITE` to remove the sample-details banner and sample RSVP prefill
- Deploys to Vercel as a static site on every push to `main`

## RSVP to a Google Sheet

Copied from the Modiri & Phemelo site. The form posts to `/api/rsvp` (Vercel function: validation, honeypot, rate limit), which passes
the reply to a Google Apps Script web app (`apps-script/Code.gs`). The script adds the reply to the **RSVPs** sheet (one row per guest
email; a repeat reply updates that row), emails the guest a confirmation in the site's colours, and sends the owner a daily 07:00 digest
on days with new replies. A **Summary** tab totals replies, headcount and dietary needs. Until the two Vercel variables below are set, the
form answers "We could not send your reply just now".

One-time setup, from the Google account that should own the sheet (the couple's Gmail):

1. script.google.com > New project. Paste `apps-script/Code.gs`, replace `PASTE_SECRET_HERE` with a long random string.
2. Run `setup` (authorise when asked; "Google hasn't verified this app" > Advanced > Go to project). It creates the sheet and the Summary tab; the link is in the execution log.
3. Optional: run `testRsvp` to add a TEST row and receive a confirmation. Delete the row afterwards.
4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the `/exec` URL.
5. In Vercel (Production) set `APPS_SCRIPT_URL` to that URL and `APPS_SCRIPT_SECRET` to the same random string, then redeploy.

Set `SITE.rsvpEmail` in `index.html` to the couple's address to show a "send from your own email app" fallback if the form cannot send.
Approval is on (`APPROVAL = true` in `Code.gs`, `approval: true` in `SITE`): each "Yes" starts as Pending; set Status to Approved or Declined in the sheet and the guest is emailed once per decision. After changing the script: run `setup`, then Deploy > Manage deployments > pencil > New version (the /exec URL stays the same).
Gmail sends up to about 100 confirmations a day from a free account. Event wording in the confirmation is at the top of `Code.gs`.

