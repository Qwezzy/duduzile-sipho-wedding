/* RSVP endpoint. Validates the form, then hands the reply to the Google Apps Script web app (apps-script/Code.gs),
   which writes the row to the RSVP sheet and emails the guest a confirmation.
   Vercel environment variables:
     APPS_SCRIPT_URL      the web app's /exec URL
     APPS_SCRIPT_SECRET   shared secret, same value as SECRET in the script            */

const MAX_GUESTS = 2;
const DIETS = ["None", "Vegetarian", "Vegan", "Halaal", "No pork", "Allergy (see note)"];
const EMAIL = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/;

/* Light per-instance rate limit. Not airtight on serverless, but stops a casual hammering. */
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 15 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < win)) hits.delete(k);
  return list.length > 8;
}

const oneLine = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const multiLine = (v, max) => String(v == null ? "" : v).replace(/\r/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);

function parse(body) {
  body = body || {};
  const g = {
    name: oneLine(body.name, 80),
    email: oneLine(body.email, 120).toLowerCase(),
    phone: oneLine(body.phone, 30),
    attending: body.attending === "yes" ? "yes" : body.attending === "no" ? "no" : "",
    guests: Math.min(MAX_GUESTS, Math.max(1, parseInt(body.guests, 10) || 1)),
    diet: DIETS.includes(body.diet) ? body.diet : "None",
    note: multiLine(body.note, 500)
  };
  if (!g.name) return { error: "Please add your full name." };
  if (!EMAIL.test(g.email)) return { error: "Please enter a valid email address." };
  if (!g.attending) return { error: "Please choose whether you will attend." };
  if (g.attending === "no") { g.guests = 0; g.diet = "None"; }
  return { g };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "Method not allowed." }); }

  /* Same-site requests only */
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ ok: false, error: "Not allowed." }); } catch (_) { return res.status(403).json({ ok: false, error: "Not allowed." }); } }

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  if (limited(ip)) return res.status(429).json({ ok: false, error: "Too many replies from this connection. Please try again in a few minutes." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (body && body.website) return res.status(200).json({ ok: true, confirmation: false });   // honeypot: bots fill this, people never see it

  const { g, error } = parse(body);
  if (error) return res.status(400).json({ ok: false, error });

  const url = process.env.APPS_SCRIPT_URL, secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) return res.status(503).json({ ok: false, error: "Online replies are not switched on yet." });

  try {
    /* Apps Script answers a POST with a redirect to the result; fetch follows it. */
    const r = await fetch(url, {
      method: "POST", redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, ...g }),
      signal: AbortSignal.timeout(25000)
    });
    const out = await r.json();
    if (!out || !out.ok) throw new Error(out && out.error || "script rejected the reply");
    return res.status(200).json({ ok: true, confirmation: out.confirmation !== false });
  } catch (e) {
    console.error("RSVP save failed:", e && e.message);
    return res.status(502).json({ ok: false, error: "We could not send your reply just now." });
  }
};
