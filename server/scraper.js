// server/scraper.js
import { chromium } from 'playwright';
import { selectors } from './selectors.js';

const STEP_TIMEOUT = 4000;

/**
 * Wait for the first selector in a list (or a single selector string) to appear.
 */
async function waitFirst(page, selList, timeout = STEP_TIMEOUT) {
  const list = Array.isArray(selList) ? selList : [selList];
  for (const sel of list) {
    try {
      const el = await page.waitForSelector(sel, { timeout });
      if (el) return el;
    } catch (_) {
      // ignore and try next selector
    }
  }
  return null;
}

/**
 * Clean the raw HTML description from PeopleVine so it looks closer to portal HTML:
 * - Remove data-* attributes
 * - Remove inline styles
 * - Strip span wrappers (keep their content)
 * - Keep semantic tags (p, br, strong, em, a, ul, ol, li, etc.)
 */
function cleanHtmlDescription(html) {
  if (!html) return '';

  let cleaned = html;

  // Remove data-* attributes
  cleaned = cleaned.replace(/\sdata-[a-zA-Z0-9_-]+="[^"]*"/g, '');

  // Remove style="..."
  cleaned = cleaned.replace(/\sstyle="[^"]*"/gi, '');

  // Remove empty class attributes (optional)
  cleaned = cleaned.replace(/\sclass="[^"]*"/gi, '');

  // Drop span tags but keep their contents
  cleaned = cleaned.replace(/<\/?span[^>]*>/gi, '');

  // Optional: collapse multiple spaces between tags
  cleaned = cleaned.replace(/>\s+</g, '><');

  return cleaned.trim();
}

/**
 * Convert HTML into reasonable plain text for fallback:
 * - Paragraphs as blank-line separated
 * - <li> into bullet lines
 * - Decodes common HTML entities
 */
function htmlToPlainText(html) {
  if (!html) return '';

  let text = html;

  // Paragraphs, list items, and line breaks → newlines
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '• ');

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",

    // Fancy quotes
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&ldquo;': '"',
    '&rdquo;': '"',

    // Dashes / ellipsis
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…'
  };

  for (const [entity, value] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), value);
  }

  // Collapse whitespace
  text = text.replace(/\r?\n\s*\r?\n\s*\r?\n+/g, '\n\n'); // max 2 blank lines
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n[ \t]+/g, '\n');

  return text.trim();
}

/**
 * Build the event URL in the member portal.
 * Option A: always baseUrl + /events/{id}
 */
function buildEventUrl(baseUrl, ev) {
  const id = ev.id ?? ev.event_id ?? ev.eventId;
  if (!id) return '';
  return `${baseUrl.replace(/\/+$/, '')}/events/${id}`;
}

/**
 * Map raw JSON from /api/events into the structure your email builder needs.
 */
function mapEvent(baseUrl, ev) {
  // Core fields
  const title = (ev.title || '').trim();
  const summary = (ev.summary || '').trim(); // SHORT description

  // Long description (HTML) – cleaned but with formatting preserved
  const rawHtml = (ev.description || '').trim();
  const longDescriptionHTML = cleanHtmlDescription(rawHtml);
  const longDescription =
    htmlToPlainText(longDescriptionHTML || summary) || summary;

  // Banner image
  let bannerImage = ev.graphic || '';
  if (bannerImage && bannerImage.startsWith('/')) {
    bannerImage = `${baseUrl.replace(/\/+$/, '')}${bannerImage}`;
  }

  // Location
  const location = (ev.venue || '').trim();

  // Dates + Times (use local fields when present)
  const startISO = ev.start_date_local?.date || ev.start_date || null;
  const endISO = ev.end_date_local?.date || ev.end_date || null;

  let startDate = '';
  let startTime = '';
  let endTime = '';

  if (startISO) {
    const d = new Date(startISO);
    startDate = d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    startTime = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  if (endISO) {
    const d = new Date(endISO);
    endTime = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  const timeRange =
    startTime && endTime && startTime !== endTime
      ? `${startTime} – ${endTime}`
      : startTime;

  const url = buildEventUrl(baseUrl, ev);

  return {
    // IDs / URL
    id: ev.id,
    url,

    // Text content
    title,
    // What your “Insider” / short description view should use
    description: summary,
    // Clean plain-text long version (for any plain-text needs)
    longDescription,
    // Clean HTML long version (for rich formatting in the email)
    longDescriptionHTML,

    // When & where
    date: startDate,
    time: timeRange,
    startISO,
    endISO,
    location,

    // Media
    bannerImage,

    // Extras that might be useful
    externalLink: ev.external_link || '',
    categories: ev.categories || [],
    availability: ev.availability || '',
    raw: ev // full raw event object
  };
}

/**
 * Scroll to the bottom of the events page to force all events to load.
 * While this runs, we'll be listening for /api/events XHR responses.
 */
async function scrollToLoadAllEvents(page, { maxEvents }) {
  let lastHeight = 0;
  let sameHeightCount = 0;

  for (let i = 0; i < 40; i++) {
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight
    );

    if (height === lastHeight) {
      sameHeightCount += 1;
      if (sameHeightCount >= 3) {
        // Height hasn't changed for several iterations – probably fully loaded
        break;
      }
    } else {
      sameHeightCount = 0;
    }

    lastHeight = height;

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });

    // Give XHRs time to fire and render
    await page.waitForTimeout(1500);

    if (typeof maxEvents === 'number' && maxEvents > 0) {
      // collector will handle slicing; nothing to do here
    }
  }

  // One extra pause for any straggler XHRs
  await page.waitForTimeout(1500);
}

/**
 * Main entry point: logs in, goes to events page, scrolls to load everything,
 * listens to /api/events responses, and returns normalized event objects.
 */
export async function scrapeEvents({
  baseUrl,
  loginUrl,
  eventsUrl,
  email,
  password,
  headless = true,
  max = 200
}) {
  const browser = await chromium.launch({
    headless:
      typeof headless === 'string'
        ? headless.toLowerCase() !== 'false'
        : !!headless
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect events from /api/events XHR calls
  const eventsMap = new Map();

  const eventsApiMatcher = (url) =>
    url.includes('/api/events') && url.includes('group=events');

  page.on('response', async (response) => {
    const url = response.url();
    if (!eventsApiMatcher(url)) return;

    try {
      if (!response.ok()) return;
      const data = await response.json();

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.data)
        ? data.data
        : [];

      for (const ev of list) {
        if (!ev || typeof ev !== 'object') continue;
        if (ev.id == null) continue;
        eventsMap.set(ev.id, ev);
      }
    } catch (err) {
      console.error('Error parsing /api/events response:', err);
    }
  });

  try {
    // --- Login flow ---
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

    const emailInput = await waitFirst(page, selectors.login.emailInput, 8000);
    if (!emailInput) throw new Error('email-input-missing');
    await emailInput.fill(email);

    const nextBtn = await waitFirst(
      page,
      selectors.login.emailNextButton,
      8000
    );
    if (!nextBtn) throw new Error('email-next-missing');
    await nextBtn.click();

    const pwInput = await waitFirst(
      page,
      selectors.login.passwordInput,
      8000
    );
    if (!pwInput) throw new Error('password-input-missing');
    await pwInput.fill(password);

    const loginBtn = await waitFirst(
      page,
      selectors.login.loginButton,
      8000
    );
    if (!loginBtn) throw new Error('login-button-missing');
    await loginBtn.click();

    // Wait for navigation away from login
    await page.waitForTimeout(1000);
    await page
      .waitForURL(
        (url) => !/\/login(?:$|[?#])/i.test(url.href),
        { timeout: 15000 }
      )
      .catch(() => {});

    // --- Go to events page ---
    await page.goto(eventsUrl, { waitUntil: 'domcontentloaded' });

    // Wait for grid/card presence if you have a selector
    if (selectors.events?.card) {
      await waitFirst(page, selectors.events.card, 8000);
    }

    // --- Scroll to load all events (XHR listener is active) ---
    await scrollToLoadAllEvents(page, { maxEvents: max });

    // Convert collected events map into list
    let allEvents = Array.from(eventsMap.values());

    if (typeof max === 'number' && max > 0) {
      allEvents = allEvents.slice(0, max);
    }

    // Normalize / map to the structure you need
    const results = allEvents.map((ev) => mapEvent(baseUrl, ev));

    // Sort by start date
    results.sort((a, b) => {
      if (!a.startISO || !b.startISO) return 0;
      return new Date(a.startISO) - new Date(b.startISO);
    });

    return results;
  } finally {
    await context.close();
    await browser.close();
  }
}
