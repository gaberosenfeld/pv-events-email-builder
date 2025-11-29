// server/email.js

// Builds an inline-styled, client-safe HTML email (table-based)
// template: "interest" | "insider"
export function buildEmailHTML(
  events,
  { title = 'This Week at Fitler Club', template = 'insider' } = {}
) {
  const safeTemplate = template === 'interest' ? 'interest' : 'insider';

  const items = events.map((e) => eventBlock(e, safeTemplate)).join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f5f7;">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px; width:100%; background:#ffffff; border-radius:8px; overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 8px 24px; font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:0; font-size:24px; line-height:1.2; color:#111111;">${escapeHtml(
                title
              )}</h1>
            </td>
          </tr>
          <tr><td style="height:8px; line-height:8px; font-size:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:0 0 16px 0;">${items}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// One block per event, shared layout; template controls which description we use.
function eventBlock(e, template) {
  const banner = e.bannerImage
    ? `<tr><td><img src="${escapeAttr(
        e.bannerImage
      )}" alt="" width="640" style="display:block; width:100%; height:auto; border:0;" /></td></tr>`
    : '';

  const title = e.title ? escapeHtml(e.title) : 'Untitled Event';

  const dateTimeText = formatEventDateTime(e);
  const dateMeta = dateTimeText
    ? `<div style="color:#374151; font-size:14px; margin-top:4px;">${escapeHtml(
        dateTimeText
      )}</div>`
    : '';

  // Description choice:
  // - "interest" → rich HTML from longDescriptionHTML (portal-style)
  // - "insider"  → short summary text (plain, escaped)
  let desc = '';

  if (template === 'interest') {
    const htmlSource =
      e.longDescriptionHTML ||
      e.longDescription || // plain fallback if no HTML
      e.description ||
      '';

    desc = htmlSource
      ? `<div style="color:#4b5563; font-size:14px; margin-top:12px; line-height:1.5;">${htmlSource}</div>`
      : '';
  } else {
    // insider: short summary text, kept safe as plain text
    const textSource =
      e.description || e.summary || e.longDescription || '';

    desc = textSource
      ? `<div style="color:#4b5563; font-size:14px; margin-top:12px; line-height:1.5;">${escapeHtml(
          textSource
        )}</div>`
      : '';
  }

  const cta = e.url
    ? `<a href="${escapeAttr(
        e.url
      )}" style="display:inline-block; margin-top:14px; background:#111111; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:4px; font-size:14px;">View Event</a>`
    : '';

  return `
<table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
  ${banner}
  <tr>
    <td style="padding:16px 24px; font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:18px; color:#111111; font-weight:bold;">${title}</div>
      ${dateMeta}
      ${desc}
      ${cta}
    </td>
  </tr>
</table>`;
}

// Format: "Thursday, November 29 at 8:00 AM" (no year)
function formatEventDateTime(e) {
  const rawDate = (e.date || '').trim();
  const rawTime = (e.time || '').trim();

  // Strip any year from the date, e.g. "Thursday, November 29, 2025" -> "Thursday, November 29"
  let datePart = rawDate
    .replace(/,\s*\d{4}\b/, '') // ", 2025"
    .replace(/\s+\d{4}\b/, '') // " 2025"
    .trim();

  // If date is something like "11/29/2025" -> "11/29"
  datePart = datePart.replace(/(\d{1,2}\/\d{1,2})\/\d{2,4}\b/, '$1');

  // Normalize time: "3:00PM" -> "3:00 PM", "pm" -> "PM"
  let timePart = rawTime;
  if (timePart) {
    timePart = timePart.replace(/(\d)(AM|PM)\b/i, '$1 $2');
    timePart = timePart.replace(/\b(am|pm)\b/g, (m) => m.toUpperCase());
  }

  if (datePart && timePart) return `${datePart} at ${timePart}`;
  if (datePart) return datePart;
  if (timePart) return timePart;
  return '';
}

function escapeHtml(s = '') {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(s = '') {
  return escapeHtml(s);
}
