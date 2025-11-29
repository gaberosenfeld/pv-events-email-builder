import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { scrapeEvents } from './scraper.js';
import { buildEmailHTML } from './email.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 5174);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/scrape', async (req, res) => {
  try {
    const { max = 50, email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const events = await scrapeEvents({
      baseUrl: process.env.BASE_URL,
      loginUrl: process.env.LOGIN_URL,
      eventsUrl: process.env.EVENTS_URL,
      email,
      password,
      headless: process.env.HEADLESS,
      max
    });
    res.json({ events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/email', async (req, res) => {
  const { events = [], title, template } = req.body || {};
  const html = buildEmailHTML(events, { title, template });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Serve the built web UI (Vite build output)
app.use(express.static('dist'));

app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
