import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const API = '';

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [allEvents, setAllEvents] = useState([]);
  const [selected, setSelected] = useState({});
  const [title, setTitle] = useState('This Week at Fitler Club');
  const [html, setHtml] = useState('');

  // per-run PeopleVine creds
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');

  // NEW: search query for events list
  const [searchQuery, setSearchQuery] = useState('');

  const selectedEvents = useMemo(
    () => allEvents.filter((_, i) => selected[i]),
    [allEvents, selected]
  );

  // NEW: filtered events for display
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const indexed = allEvents.map((event, index) => ({ event, index }));
    if (!q) return indexed;

    return indexed.filter(({ event }) => {
      const title = (event.title || '').toLowerCase();
      const date = (event.date || '').toLowerCase();
      const summary = (
        event.description ||
        event.summary ||
        ''
      ).toLowerCase();
      return (
        title.includes(q) ||
        date.includes(q) ||
        summary.includes(q)
      );
    });
  }, [allEvents, searchQuery]);

  useEffect(() => {
    // no-op for now
  }, []);

  const runScrape = async () => {
    if (!portalEmail || !portalPassword) {
      alert('Enter your PeopleVine portal email and password first.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max: 200,
          email: portalEmail,
          password: portalPassword
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');

      const events = j.events || [];
      setAllEvents(events);

      // NEW: do NOT preselect anything after scraping
      setSelected({});
      // Optional: reset search each scrape
      setSearchQuery('');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // template: "interest" | "insider"
  const buildHtml = async (template) => {
    if (!selectedEvents.length) {
      alert('Select at least one event.');
      return;
    }
    const r = await fetch(`${API}/api/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: selectedEvents,
        title,
        template // <-- tells the backend which layout to use
      })
    });
    const text = await r.text();
    setHtml(text);
  };

  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fitler-events.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyHtml = async () => {
    await navigator.clipboard.writeText(html);
    alert('HTML copied to clipboard');
  };

  const handleSelectAll = () => {
    const next = {};
    allEvents.forEach((_, i) => {
      next[i] = true;
    });
    setSelected(next);
  };

  const handleDeselectAll = () => {
    setSelected({});
  };

  return (
    <div className="container">
      <div className="grid">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Scrape & Select</h2>

          {/* portal login fields */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: '#a5a7ab',
                  marginBottom: 4
                }}
              >
                PeopleVine Email
              </label>
              <input
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid #2f2f36',
                  background: '#0f0f12',
                  color: '#fff'
                }}
                type="email"
                value={portalEmail}
                onChange={(e) => setPortalEmail(e.target.value)}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: '#a5a7ab',
                  marginBottom: 4
                }}
              >
                PeopleVine Password
              </label>
              <input
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid #2f2f36',
                  background: '#0f0f12',
                  color: '#fff'
                }}
                type="password"
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="controls" style={{ marginBottom: 12 }}>
            <button className="btn" onClick={runScrape} disabled={loading}>
              {loading ? 'Scraping…' : 'Scrape Events'}
            </button>
          </div>

          {error && (
            <div className="card" style={{ color: '#ff8080' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: '#a5a7ab',
                marginBottom: 6
              }}
            >
              Email Title
            </label>
            <input
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #2f2f36',
                background: '#0f0f12',
                color: '#fff'
              }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* NEW: search box above Select / Deselect */}
          <div style={{ marginBottom: 8 }}>
            <input
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 8,
                border: '1px solid #2f2f36',
                background: '#0f0f12',
                color: '#fff'
              }}
              type="text"
              placeholder="Search events…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Select all / Deselect all */}
          <div className="controls" style={{ marginBottom: 8 }}>
            <button
              className="btn secondary"
              type="button"
              onClick={handleSelectAll}
              disabled={!allEvents.length}
            >
              Select All
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={handleDeselectAll}
              disabled={!allEvents.length}
            >
              Deselect All
            </button>
          </div>

          <div className="list">
            {filteredEvents.map(({ event: e, index: i }) => (
              <label
                key={i}
                className="card"
                style={{ display: 'flex', gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={!!selected[i]}
                  onChange={(ev) =>
                    setSelected((s) => ({
                      ...s,
                      [i]: ev.target.checked
                    }))
                  }
                />
                <div>
                  <div className="title">{e.title || 'Untitled'}</div>
                  <div className="date">
                    {/* basic date string under each event for selection UI */}
                    {e.date || ''}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Email Preview</h2>
          <div className="controls" style={{ marginBottom: 12 }}>
            {/* Interest vs Insider */}
            <button
              className="btn"
              onClick={() => buildHtml('interest')}
              disabled={!allEvents.length}
            >
              Interest Email
            </button>
            <button
              className="btn secondary"
              onClick={() => buildHtml('insider')}
              disabled={!allEvents.length}
            >
              Insider Email
            </button>
            <button
              className="btn secondary"
              onClick={copyHtml}
              disabled={!html}
            >
              Copy HTML
            </button>
            <button
              className="btn secondary"
              onClick={downloadHtml}
              disabled={!html}
            >
              Download
            </button>
          </div>
          <div className="preview">
            {html ? (
              <iframe title="preview" srcDoc={html} />
            ) : (
              <div className="card">
                No HTML yet. Choose Interest or Insider to build.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
