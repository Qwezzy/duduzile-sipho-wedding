/* Duduzile & Sipho RSVP collector (Google Apps Script).
   The site's /api/rsvp function posts each reply here. This script:
     1. adds the reply to the "RSVPs" sheet (one row per guest email; a repeat reply updates that row)
     2. emails the guest a confirmation
     3. emails the owner a daily digest of new replies (only on days there are some)
     4. approval: each "Yes" reply starts as Pending. The couple set the Status column to Approved or
        Declined, and the guest is emailed the decision (once per decision). Set APPROVAL to false to switch this off.
   Setup: see README.md ("RSVP to a Google Sheet"). Run setup() once, then deploy as a web app. */

const SECRET = "PASTE_SECRET_HERE";   // must match APPS_SCRIPT_SECRET in Vercel
const REPLY_TO = "";                  // where guests' replies to the confirmation go. Blank = the owner of this script
const DIGEST_TO = "";                 // who gets the daily digest. Blank = the owner of this script
const SENDER_NAME = "Duduzile & Sipho";
const RSVP_CONTACT = "";                 // optional: a person named in the confirmation as the RSVP contact
const APPROVAL = false;               // true: the couple approve each "Yes" reply in the sheet before the guest is confirmed
const SEND_DECLINE_EMAIL = true;      // true: a kind email also goes out when Status is set to Declined

const EVENT = {
  couple: "Duduzile & Sipho",
  header: "19 & 20 DECEMBER 2026 · LIMPOPO",
  days: [
    ["Saturday 19 December, 10:00", "The Bride's Home, Dindela, Limpopo"],
    ["Sunday 20 December, 12:00", "The Groom's Home, Dindela, Limpopo"]
  ],
  dress: "Formal or traditional wear (colours: chocolate brown, champagne & white)",
  site: "https://duduzile-sipho-wedding.vercel.app/#directions"
};
const MAX_GUESTS = 2;
const DIETS = ["None", "Vegetarian", "Vegan", "Halaal", "No pork", "Allergy (see note)"];
const TAB = "RSVPs";
const HEAD = ["Received", "Updated", "Name", "Email", "Cell", "Attending", "Number attending", "Dietary", "Note", "Replies", "Status", "Guest emailed"];
const C = { RECEIVED: 1, UPDATED: 2, NAME: 3, EMAIL: 4, CELL: 5, ATT: 6, NUM: 7, DIET: 8, NOTE: 9, REPLIES: 10, STATUS: 11, NOTIFIED: 12 };
const STATUSES = ["Pending", "Approved", "Declined"];

/* ---------- one-off setup: creates the sheet, the Summary tab and the daily digest ---------- */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const id = props.getProperty("SHEET_ID");
  if (id) ss = SpreadsheetApp.openById(id);
  else { ss = SpreadsheetApp.create("Duduzile & Sipho RSVPs"); props.setProperty("SHEET_ID", ss.getId()); }

  let sh = ss.getSheetByName(TAB);
  if (!sh) { sh = ss.getSheets()[0]; sh.setName(TAB); }
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold").setBackground("#3A2317").setFontColor("#FCFAF6");
  sh.setFrozenRows(1);
  sh.getRange("A:B").setNumberFormat("yyyy-mm-dd hh:mm");
  [150, 150, 170, 220, 120, 90, 90, 130, 300, 70, 110, 200].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange("I:I").setWrap(true);
  // Status dropdown (the couple's decision) with colours, and any "Yes" reply without a status becomes Pending
  const stRange = sh.getRange(2, C.STATUS, 1000, 1);
  stRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  const colour = (text, bg, fg) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setRanges([stRange]).build();
  sh.setConditionalFormatRules([colour("Pending", "#fff2cc", "#7f6000"), colour("Approved", "#d9ead3", "#274e13"), colour("Declined", "#f4cccc", "#990000")]);
  const last = sh.getLastRow();
  if (APPROVAL && last > 1) {
    const cur = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
    cur.forEach((r, i) => { if (r[C.ATT - 1] === "Yes" && !r[C.STATUS - 1]) sh.getRange(i + 2, C.STATUS).setValue("Pending"); });
  }

  let sum = ss.getSheetByName("Summary");
  if (!sum) sum = ss.insertSheet("Summary", 0);
  sum.clear();
  const R = TAB + "!";
  const rows = [
    ["Duduzile & Sipho RSVP summary", ""],
    ["", ""],
    ["Replies received", "=COUNTA(" + R + "D2:D)"],
    ["Replies: attending", '=COUNTIF(' + R + 'F2:F,"Yes")'],
    ["Replies: declined", '=COUNTIF(' + R + 'F2:F,"No")'],
    ["Total headcount attending", '=SUMIF(' + R + 'F2:F,"Yes",' + R + 'G2:G)'],
    ["Last reply", "=IF(COUNT(" + R + "A2:A)=0,\"none yet\",MAX(" + R + "A2:A))"],
    ["", ""],
    ["Awaiting your decision (Pending)", '=COUNTIF(' + R + 'K2:K,"Pending")'],
    ["Approved (replies)", '=COUNTIF(' + R + 'K2:K,"Approved")'],
    ["Approved headcount", '=SUMIF(' + R + 'K2:K,"Approved",' + R + 'G2:G)'],
    ["Declined by you (replies)", '=COUNTIF(' + R + 'K2:K,"Declined")'],
    ["", ""],
    ["Dietary needs (attending replies)", ""]
  ];
  const dietRow = rows.length;
  DIETS.filter(d => d !== "None").forEach(d => rows.push([d, '=COUNTIFS(' + R + 'F2:F,"Yes",' + R + 'H2:H,"' + d + '")']));
  sum.getRange(1, 1, rows.length, 2).setFormulas(rows);
  sum.getRange("A1").setFontSize(14).setFontWeight("bold");
  sum.getRange("A" + dietRow).setFontWeight("bold");
  sum.getRange("B7").setNumberFormat("yyyy-mm-dd hh:mm");
  sum.getRange("B:B").setHorizontalAlignment("left");
  sum.setColumnWidth(1, 260); sum.setColumnWidth(2, 150);

  installDigest();
  installEditTrigger(ss);
  Logger.log("Sheet ready: " + ss.getUrl());
}

function installDigest() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "sendDigest").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sendDigest").timeBased().everyDays(1).atHour(7).create();
}

/* Runs when the couple change a Status cell. It must be an installable trigger, because simple triggers cannot send email. */
function installEditTrigger(ss) {
  ss = ss || SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "onStatusEdit").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onStatusEdit").forSpreadsheet(ss).onEdit().create();
}

/* ---------- web app entry point ---------- */
function doPost(e) {
  let out;
  try {
    const d = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET === "PASTE_SECRET_HERE" || d.secret !== SECRET) out = { ok: false, error: "unauthorised" };
    else out = save(clean(d));
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return ContentService.createTextOutput("RSVP collector is running."); }

const one = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
function clean(d) {
  const attending = d.attending === "yes" ? "yes" : d.attending === "no" ? "no" : "";
  const g = {
    name: one(d.name, 80), email: one(d.email, 120).toLowerCase(), phone: one(d.phone, 30), attending,
    guests: Math.min(MAX_GUESTS, Math.max(1, parseInt(d.guests, 10) || 1)),
    diet: DIETS.indexOf(d.diet) >= 0 ? d.diet : "None",
    note: String(d.note == null ? "" : d.note).replace(/\r/g, "").replace(/[ \t]+/g, " ").trim().slice(0, 500)
  };
  if (!g.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g.email) || !g.attending) throw new Error("invalid reply");
  if (g.attending === "no") { g.guests = 0; g.diet = "None"; }
  return g;
}

/* Add or update the guest's row, then send the confirmation. The row is saved before any email goes out. */
function save(g) {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
  const sh = ss.getSheetByName(TAB);
  const lock = LockService.getScriptLock();
  let status = "";
  lock.waitLock(20000);
  try {
    const now = new Date();
    const n = Math.max(sh.getLastRow() - 1, 0);
    const emails = n ? sh.getRange(2, C.EMAIL, n, 1).getValues().map(r => String(r[0]).toLowerCase()) : [];
    const at = emails.indexOf(g.email);
    const yes = g.attending === "yes";
    const vals = [g.name, g.email, g.phone, yes ? "Yes" : "No", g.guests, g.diet, g.note];
    if (at >= 0) {
      const row = at + 2;
      const prev = sh.getRange(row, 1, 1, HEAD.length).getValues()[0];
      const replies = Number(prev[C.REPLIES - 1]) || 1;
      sh.getRange(row, C.UPDATED, 1, 9).setValues([[now].concat(vals).concat([replies + 1])]);
      if (APPROVAL) {
        // A changed "attending" or head count goes back to Pending so the couple decide again
        const changed = prev[C.ATT - 1] !== (yes ? "Yes" : "No") || Number(prev[C.NUM - 1]) !== g.guests;
        if (!yes) status = "";
        else if (changed || !prev[C.STATUS - 1]) { status = "Pending"; sh.getRange(row, C.NOTIFIED).setValue(""); }
        else status = String(prev[C.STATUS - 1]);
        sh.getRange(row, C.STATUS).setValue(status);
      }
    } else {
      status = APPROVAL && yes ? "Pending" : "";
      sh.appendRow([now, now].concat(vals).concat([1, status, ""]));
    }
  } finally { lock.releaseLock(); }

  let confirmation = true;
  try { sendConfirmation(g, status); } catch (err) { confirmation = false; console.error("Confirmation failed: " + err); }
  return { ok: true, confirmation };
}

/* ---------- emails ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DAY_DETAILS = () => EVENT.days.concat([["Dress code", EVENT.dress], ["Directions", EVENT.site]]);
const CONTACT_LINE = RSVP_CONTACT ? " You can also contact " + RSVP_CONTACT + " (RSVP)." : "";

/* One shared layout for every guest email: intro, a "your reply" table, optional day details, closing line. */
function sendGuestMail(to, subject, first, intro, rows, details, closing) {
  const text = ["Dear " + first + ",", "", intro, ""].concat(rows.length ? ["YOUR REPLY"].concat(rows.map(r => r[0] + ": " + r[1])) : [])
    .concat(details.length ? ["", "THE WEEKEND"].concat(details.map(r => r[0] + ": " + r[1])) : [])
    .concat(["", closing, "", "With love,", EVENT.couple]).join("\n");
  const tr = r => '<tr><td style="padding:4px 14px 4px 0;color:#7A5838;font-size:13px;letter-spacing:.08em;text-transform:uppercase;vertical-align:top">' + esc(r[0]) + '</td><td style="padding:4px 0;color:#3A2317;font-size:16px">' + esc(r[1]) + "</td></tr>";
  const html = '<div style="background:#F2EADD;padding:0"><div style="max-width:520px;margin:0 auto;padding:36px 24px;background:#FCFAF6;color:#3A2317;font-family:Georgia,\'Times New Roman\',serif;line-height:1.55">' +
    '<p style="margin:0 0 6px;text-align:center;font-size:12px;letter-spacing:.3em;color:#7A5838">' + esc(EVENT.header) + '</p>' +
    '<h1 style="margin:0 0 22px;text-align:center;font-weight:normal;font-size:26px;letter-spacing:.14em;color:#3A2317">DUDUZILE &amp; SIPHO</h1>' +
    '<p style="margin:0 0 14px;font-size:17px">Dear ' + esc(first) + ",</p>" +
    '<p style="margin:0 0 22px;font-size:17px">' + esc(intro) + "</p>" +
    (rows.length ? '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.24em;color:#7A5838">YOUR REPLY</p><table role="presentation" style="border-collapse:collapse;margin-bottom:22px">' + rows.map(tr).join("") + "</table>" : "") +
    (details.length ? '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.24em;color:#7A5838">THE WEEKEND</p><table role="presentation" style="border-collapse:collapse;margin-bottom:22px">' + details.map(tr).join("") + "</table>" : "") +
    '<p style="margin:0 0 22px;font-size:16px;color:#7A5838;font-style:italic">' + esc(closing) + "</p>" +
    '<p style="margin:0;font-size:17px">With love,<br>' + esc(EVENT.couple) + "</p></div></div>";
  const opts = { to, subject, body: text, htmlBody: html, name: SENDER_NAME };
  if (REPLY_TO) opts.replyTo = REPLY_TO;
  MailApp.sendEmail(opts);
}

/* Sent when the guest submits or changes a reply. With APPROVAL on, a "Yes" reply is only a receipt until the couple approve it. */
function sendConfirmation(g, status) {
  const yes = g.attending === "yes";
  const first = g.name.split(" ")[0];
  const rows = [
    ["Name", g.name], ["Attending", yes ? "Yes" : "No"],
    yes ? ["Number attending", String(g.guests)] : null,
    yes && g.diet !== "None" ? ["Dietary needs", g.diet] : null,
    g.phone ? ["Cell", g.phone] : null,
    g.note ? ["Your note", g.note] : null
  ].filter(Boolean);
  const pending = APPROVAL && yes && status !== "Approved";
  const intro = !yes
    ? "Thank you for letting us know. We have received your reply and we will miss you on the day."
    : status === "Approved"
      ? "Thank you. We have updated your reply and your place is still confirmed."
      : APPROVAL
        ? "Thank you for your RSVP. We have received it. Your place is confirmed once we approve it, and you will get a second email from us when we do."
        : "Thank you for your RSVP. We have received it and your reservation is done. We cannot wait to celebrate with you.";
  const details = yes && !pending ? DAY_DETAILS() : [];
  const closing = "Need to change something? Just reply to this email and we will update your reply." + CONTACT_LINE;
  const subject = pending ? "We have received your RSVP · " + EVENT.couple : "Your RSVP is confirmed · " + EVENT.couple;
  sendGuestMail(g.email, !yes ? "Your RSVP · " + EVENT.couple : subject, first, intro, rows, details, closing);
}

/* Sent when the couple set Status to Approved or Declined. */
function sendDecision(name, email, num, status) {
  const first = String(name).split(" ")[0];
  if (status === "Approved") {
    sendGuestMail(email, "You are approved · " + EVENT.couple, first,
      "You have been approved to join us at our wedding. We are delighted, and we cannot wait to celebrate with you.",
      [["Name", name], ["Places confirmed", String(num)]], DAY_DETAILS(),
      "Need to change something? Just reply to this email." + CONTACT_LINE);
  } else {
    sendGuestMail(email, "Your RSVP · " + EVENT.couple, first,
      "Thank you for replying. We are sorry that we are unable to confirm a place for you at our wedding. We are grateful for your understanding and your kind wishes.",
      [], [], "If you have any questions, just reply to this email." + CONTACT_LINE);
  }
}

/* Installable edit trigger: emails the guest when a Status cell is set to Approved or Declined, once per decision. */
function onStatusEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== TAB) return;
  const c1 = e.range.getColumn(), c2 = c1 + e.range.getNumColumns() - 1;
  if (C.STATUS < c1 || C.STATUS > c2) return;
  const first = Math.max(e.range.getRow(), 2), lastRow = e.range.getRow() + e.range.getNumRows() - 1;
  for (let row = first; row <= lastRow; row++) decide(sh, row);
}
function decide(sh, row) {
  const r = sh.getRange(row, 1, 1, HEAD.length).getValues()[0];
  const status = String(r[C.STATUS - 1]);
  if (status !== "Approved" && status !== "Declined") return;
  if (r[C.ATT - 1] !== "Yes") return;
  if (String(r[C.NOTIFIED - 1]).indexOf(status) === 0) return;            // this decision was already emailed
  if (status === "Declined" && !SEND_DECLINE_EMAIL) { sh.getRange(row, C.NOTIFIED).setValue("Declined (no email sent)"); return; }
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  try {
    sendDecision(r[C.NAME - 1], r[C.EMAIL - 1], r[C.NUM - 1], status);
    sh.getRange(row, C.NOTIFIED).setValue(status + " " + stamp);
  } catch (err) {
    sh.getRange(row, C.NOTIFIED).setValue("Email failed: " + String(err && err.message || err).slice(0, 80));
  }
}

/* Daily at 07:00 (script time zone): new replies since the last digest. Sends nothing on quiet days. */
function sendDigest() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(props.getProperty("SHEET_ID"));
  const sh = ss.getSheetByName(TAB);
  const since = Number(props.getProperty("LAST_DIGEST")) || 0;
  const n = Math.max(sh.getLastRow() - 1, 0);
  if (!n) return;
  const data = sh.getRange(2, 1, n, HEAD.length).getValues();
  const fresh = data.filter(r => new Date(r[C.UPDATED - 1]).getTime() > since);
  props.setProperty("LAST_DIGEST", String(Date.now()));
  if (!fresh.length) return;
  const yes = data.filter(r => r[C.ATT - 1] === "Yes");
  const head = yes.reduce((s, r) => s + (Number(r[C.NUM - 1]) || 0), 0);
  const lines = fresh.map(r => "- " + r[C.NAME - 1] + ": " + r[C.ATT - 1] + (r[C.ATT - 1] === "Yes" ? " (" + r[C.NUM - 1] + ")" : "") + (r[C.DIET - 1] && r[C.DIET - 1] !== "None" ? ", " + r[C.DIET - 1] : ""));
  const pending = APPROVAL ? data.filter(r => r[C.STATUS - 1] === "Pending").length : 0;
  const body = [EVENT.couple + ": " + fresh.length + " new or updated RSVP(s):", ""].concat(lines).concat(["",
    "Totals so far: " + data.length + " replies, " + yes.length + " attending (" + head + " people), " + (data.length - yes.length) + " declined."]
    .concat(APPROVAL ? ["Waiting for your decision: " + pending + ". Open the sheet and set Status to Approved or Declined."] : [])
    .concat(["", "Sheet: " + ss.getUrl()])).join("\n");
  MailApp.sendEmail({ to: DIGEST_TO || Session.getEffectiveUser().getEmail(), subject: EVENT.couple + " RSVP digest: " + fresh.length + " new · " + head + " attending" + (APPROVAL ? " · " + pending + " to approve" : ""), body, name: SENDER_NAME });
}

/* Optional check: adds a TEST row and sends a confirmation to the address below. Delete the row afterwards. */
function testRsvp() {
  const me = Session.getEffectiveUser().getEmail();
  Logger.log(JSON.stringify(save(clean({ name: "TEST Guest", email: me, phone: "000", attending: "yes", guests: 2, diet: "Vegetarian", note: "Test row, please delete." }))));
}
