/**
 * TI Agent — Backend Server  v2
 * Routes:
 *   GET  /health
 *   GET  /api/config                   — load all config keys
 *   PUT  /api/config                   — save config keys (never apiKey)
 *   GET  /api/config/export            — download full config + feeds as JSON
 *   POST /api/config/import            — import a previously exported config file
 *   GET  /api/feeds/custom             — list custom feeds
 *   POST /api/feeds/custom             — add custom feed
 *   DELETE /api/feeds/custom/:id       — remove custom feed
 *   GET  /api/reports                  — list reports (no body)
 *   GET  /api/reports/:id              — single report with body
 *   POST /api/reports                  — save report
 *   DELETE /api/reports/:id            — delete report
 *   GET  /api/costs                    — cost ledger rows
 *   GET  /api/reports/:id/export       — export as md / html / pdf / docx
 *   POST /api/analyze                  — Anthropic API proxy
 */

const express  = require("express");
const cors     = require("cors");
const fetch    = require("node-fetch");
const Database = require("better-sqlite3");
const path     = require("path");

// ─── Database ─────────────────────────────────────────────────────────────────
const fs = require("fs");
const DB_PATH = path.join(__dirname, "ti-agent.db");
console.log("📂  DB path:", DB_PATH);
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
// Confirm file was created/opened
const dbStat = fs.statSync(DB_PATH);
console.log("📦  DB file size:", dbStat.size, "bytes");

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_feeds (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    xmlUrl     TEXT NOT NULL DEFAULT '',
    url        TEXT         DEFAULT '',
    category   TEXT NOT NULL DEFAULT 'Custom',
    color      TEXT NOT NULL DEFAULT '#c084fc',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT NOT NULL,
    query           TEXT,
    date_from       TEXT,
    date_to         TEXT,
    sources         INTEGER,
    model_id        TEXT,
    model_name      TEXT,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    input_cost      REAL,
    output_cost     REAL,
    total_cost      REAL,
    est_input_tok   INTEGER,
    est_output_tok  INTEGER,
    est_total_cost  REAL,
    body            TEXT,
    source_map      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

console.log("📦  Database ready at", DB_PATH);

// ─── Migrations: add columns that didn't exist in older versions ──────────────
try { db.exec("ALTER TABLE reports ADD COLUMN source_map TEXT"); } catch(e) { /* already exists */ }

// ─── Prepared statements ──────────────────────────────────────────────────────
const stmts = {
  getAllConfig:  db.prepare("SELECT key, value FROM config"),
  setConfig:    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)"),

  getFeeds:     db.prepare("SELECT * FROM custom_feeds ORDER BY created_at ASC"),
  insertFeed:   db.prepare(`
    INSERT OR REPLACE INTO custom_feeds (id, name, xmlUrl, url, category, color)
    VALUES (@id, @name, @xmlUrl, @url, @category, @color)
  `),
  deleteFeed:   db.prepare("DELETE FROM custom_feeds WHERE id = ?"),

  insertReport: db.prepare(`
    INSERT INTO reports
      (timestamp, query, date_from, date_to, sources, model_id, model_name,
       input_tokens, output_tokens, input_cost, output_cost, total_cost,
       est_input_tok, est_output_tok, est_total_cost, body, source_map)
    VALUES
      (@timestamp, @query, @date_from, @date_to, @sources, @model_id, @model_name,
       @input_tokens, @output_tokens, @input_cost, @output_cost, @total_cost,
       @est_input_tok, @est_output_tok, @est_total_cost, @body, @source_map)
  `),
  listReports:  db.prepare(`
    SELECT id, timestamp, query, date_from, date_to, sources,
           model_id, model_name, input_tokens, output_tokens,
           input_cost, output_cost, total_cost,
           est_input_tok, est_output_tok, est_total_cost
    FROM reports ORDER BY id DESC
  `),
  getReport:    db.prepare("SELECT * FROM reports WHERE id = ?"),
  deleteReport: db.prepare("DELETE FROM reports WHERE id = ?"),
  allCosts:     db.prepare(`
    SELECT id, timestamp, model_id, model_name, sources,
           input_tokens, output_tokens, input_cost, output_cost, total_cost,
           est_input_tok, est_output_tok, est_total_cost
    FROM reports ORDER BY id ASC
  `),
};

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();
const ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin) and localhost only
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","x-api-key"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));
// preflight handled by cors() middleware above
app.use(express.json({ limit: "16mb" }));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ─── RSS/Atom Feed Fetcher ────────────────────────────────────────────────────
// Parses RSS 2.0 and Atom 1.0 feeds, returns articles within the date window.
// No external parser needed — uses regex extraction on well-structured XML.

function extractTag(xml, tag) {
  // Extracts first occurrence of <tag>...</tag> or <tag ...>...</tag>
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function stripCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) => inner).trim();
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(s) {
  if (!s) return null;
  try { const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
  catch { return null; }
}

function parseRssAtom(xml, feedName, feedUrl, dateFrom, dateTo) {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to   = new Date(dateTo   + "T23:59:59Z");
  const articles = [];

  // Detect Atom vs RSS by presence of <entry> or <item>
  const isAtom = /<entry[\s>]/.test(xml);
  const itemTag = isAtom ? "entry" : "item";

  // Split into items
  const itemRe = new RegExp(`<${itemTag}[\\s>]([\\s\\S]*?)<\\/${itemTag}>`, "gi");
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];

    // Title
    const titleRaw = extractTag(block, "title");
    const title = stripHtml(stripCdata(titleRaw)) || "(no title)";

    // Link — Atom uses <link href="..."/> or <link>url</link>; RSS uses <link>url</link>
    let link = "";
    if (isAtom) {
      link = extractAttr(block, "link", "href") || stripCdata(extractTag(block, "link"));
    } else {
      link = stripCdata(extractTag(block, "link"));
      // Some RSS uses <guid isPermaLink="true"> as the link
      if (!link || link.startsWith("http") === false) {
        const guid = stripCdata(extractTag(block, "guid"));
        if (guid.startsWith("http")) link = guid;
      }
    }
    link = link.trim();

    // Date — RSS: pubDate / dc:date; Atom: published / updated
    const rawDate = isAtom
      ? (extractTag(block, "published") || extractTag(block, "updated"))
      : (extractTag(block, "pubDate") || extractTag(block, "dc:date") || extractTag(block, "date"));

    const pub = parseDate(stripCdata(rawDate));

    // Date filter — skip articles outside window (if we can determine the date)
    if (pub) {
      if (pub < from || pub > to) continue;
    }

    // Summary / description
    const summaryRaw = isAtom
      ? (extractTag(block, "summary") || extractTag(block, "content"))
      : (extractTag(block, "description") || extractTag(block, "content:encoded"));
    const summary = stripHtml(stripCdata(summaryRaw)).slice(0, 800);

    articles.push({
      title,
      url:  link || feedUrl,
      date: pub ? pub.toISOString().slice(0, 10) : "date-unknown",
      summary,
      feedName,
    });
  }

  return articles;
}

// POST /api/fetch-feeds
// Body: { feeds: [{id, name, xmlUrl, url}], dateFrom, dateTo }
// Returns: { articles: [{title, url, date, summary, feedName, feedIndex}], errors: [...] }
app.post("/api/fetch-feeds", async (req, res) => {
  const { feeds, dateFrom, dateTo } = req.body || {};
  if (!Array.isArray(feeds) || !feeds.length)
    return res.status(400).json({ error: "feeds array required" });

  const TIMEOUT_MS   = 8000;
  const MAX_PER_FEED = 15;   // cap articles per feed to control prompt size
  const allArticles  = [];
  const errors       = [];

  await Promise.allSettled(feeds.map(async (feed, idx) => {
    const feedUrl = feed.xmlUrl || feed.url;
    if (!feedUrl) { errors.push({ feed: feed.name, error: "No URL" }); return; }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const r = await fetch(feedUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "TI-Agent/1.0 (RSS reader; research use)",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
      }).finally(() => clearTimeout(timer));

      if (!r.ok) { errors.push({ feed: feed.name, error: `HTTP ${r.status}` }); return; }

      const ct = r.headers.get("content-type") || "";
      // Skip binary / non-text responses
      if (!ct.includes("xml") && !ct.includes("text") && !ct.includes("json") && !ct.includes("octet")) {
        errors.push({ feed: feed.name, error: `Unexpected content-type: ${ct}` });
        return;
      }

      const xml = await r.text();
      const articles = parseRssAtom(xml, feed.name, feed.url || feedUrl, dateFrom, dateTo);
      const capped = articles.slice(0, MAX_PER_FEED);
      capped.forEach(a => { a.feedIndex = idx + 1; allArticles.push(a); });

      console.log(`  [${idx+1}] ${feed.name}: ${articles.length} articles in window → ${capped.length} used`);
    } catch (e) {
      const msg = e.name === "AbortError" ? "Timeout" : e.message;
      errors.push({ feed: feed.name, error: msg });
      console.warn(`  [${idx+1}] ${feed.name}: FAILED — ${msg}`);
    }
  }));

  console.log(`Feed fetch complete: ${allArticles.length} total articles, ${errors.length} feed errors`);
  res.json({ articles: allArticles, errors });
});

// ─── Anthropic proxy ──────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !apiKey.startsWith("sk-ant-"))
    return res.status(401).json({ error: "Invalid or missing API key." });
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "x-api-key":            apiKey,
        "anthropic-version":    "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Proxy error: " + err.message });
  }
});

// ─── Config ───────────────────────────────────────────────────────────────────
app.get("/api/config", (_req, res) => {
  const rows = stmts.getAllConfig.all();
  const config = {};
  rows.forEach(r => {
    try { config[r.key] = JSON.parse(r.value); }
    catch { config[r.key] = r.value; }
  });
  res.json(config);
});

app.put("/api/config", (req, res) => {
  const save = db.transaction(obj => {
    for (const [key, value] of Object.entries(obj)) {
      if (key === "apiKey") continue; // never persist API key
      stmts.setConfig.run(key, JSON.stringify(value));
    }
  });
  save(req.body);
  res.json({ ok: true });
});

// ── Config export: full snapshot of settings + custom feeds as JSON file ──────
app.get("/api/config/export", (_req, res) => {
  const rows = stmts.getAllConfig.all();
  const config = {};
  rows.forEach(r => {
    try { config[r.key] = JSON.parse(r.value); }
    catch { config[r.key] = r.value; }
  });
  delete config.apiKey; // safety

  const feeds = stmts.getFeeds.all();
  const snapshot = {
    exportedAt: new Date().toISOString(),
    version: 2,
    config,
    customFeeds: feeds,
  };

  const filename = `ti-agent-config-${new Date().toISOString().slice(0,10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(snapshot, null, 2));
});

// ── Config import ──────────────────────────────────────────────────────────────
app.post("/api/config/import", (req, res) => {
  const { config, customFeeds } = req.body;
  if (!config) return res.status(400).json({ error: "Missing config object." });

  const doImport = db.transaction(() => {
    // Save config keys
    for (const [key, value] of Object.entries(config)) {
      if (key === "apiKey") continue;
      stmts.setConfig.run(key, JSON.stringify(value));
    }
    // Upsert custom feeds
    if (Array.isArray(customFeeds)) {
      for (const f of customFeeds) {
        stmts.insertFeed.run({
          id:       f.id,
          name:     f.name,
          xmlUrl:   f.xmlUrl || f.url || "",
          url:      f.url    || f.xmlUrl || "",
          category: f.category || "Custom",
          color:    f.color    || "#c084fc",
        });
      }
    }
  });
  doImport();
  res.json({ ok: true });
});

// ─── Custom feeds ─────────────────────────────────────────────────────────────
app.get("/api/feeds/custom", (_req, res) => res.json(stmts.getFeeds.all()));

app.post("/api/feeds/custom", (req, res) => {
  const f = req.body;
  if (!f.id || !f.name)
    return res.status(400).json({ error: "id and name are required." });
  try {
    stmts.insertFeed.run({
      id:       f.id,
      name:     f.name,
      xmlUrl:   f.xmlUrl || f.url || "",
      url:      f.url    || f.xmlUrl || "",
      category: f.category || "Custom",
      color:    f.color    || "#c084fc",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: "Feed ID already exists: " + err.message });
  }
});

app.delete("/api/feeds/custom/:id", (req, res) => {
  stmts.deleteFeed.run(req.params.id);
  res.json({ ok: true });
});

// ─── Reports ──────────────────────────────────────────────────────────────────
app.get("/api/reports", (_req, res) => res.json(stmts.listReports.all()));

app.get("/api/reports/:id", (req, res) => {
  const row = stmts.getReport.get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Not found." });
  res.json(row);
});

app.delete("/api/reports/:id", (req, res) => {
  stmts.deleteReport.run(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/reports", (req, res) => {
  const r = req.body;
  if (!r || !r.timestamp) {
    console.error("POST /api/reports — missing or empty body");
    return res.status(400).json({ error: "Missing report data." });
  }
  const bodySize = r.report ? Buffer.byteLength(r.report, "utf8") : 0;
  console.log(`Saving report: model=${r.modelId} sources=${r.sources} body=${(bodySize/1024).toFixed(1)}KB`);
  try {
    const info = stmts.insertReport.run({
      timestamp:      r.timestamp,
      query:          r.query,
      date_from:      r.dateFrom,
      date_to:        r.dateTo,
      sources:        r.sources,
      model_id:       r.modelId,
      model_name:     r.modelName,
      input_tokens:   r.inputTokens,
      output_tokens:  r.outputTokens,
      input_cost:     r.inputCost,
      output_cost:    r.outputCost,
      total_cost:     r.totalCost,
      est_input_tok:  r.estInputTokens,
      est_output_tok: r.estOutputTokens,
      est_total_cost: r.estTotalCost,
      body:           r.report || "",
      source_map:     r.sourceMap ? JSON.stringify(r.sourceMap) : null,
    });
    const newId = info.lastInsertRowid;
    console.log(`  → Saved as report id=${newId}`);
    res.json({ ok: true, id: newId });
  } catch (err) {
    console.error("DB insert error:", err.message);
    res.status(500).json({ error: "DB insert failed: " + err.message });
  }
});

// ─── Costs ────────────────────────────────────────────────────────────────────
app.get("/api/costs", (_req, res) => res.json(stmts.allCosts.all()));

// ─── Minimal ZIP builder for DOCX ─────────────────────────────────────────────
// A .docx is a ZIP (PKZIP format) containing XML files.
// Sending raw XML with a .docx extension causes Word's "unreadable content" error.
// This builds a valid ZIP with no external dependencies using Node's built-in zlib.
const zlib = require("zlib");

function u16le(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files) {
  // files: [{name: string, data: Buffer}]
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer  = Buffer.from(file.name, "utf8");
    const compressed  = zlib.deflateRawSync(file.data, { level: 6 });
    const crc         = crc32(file.data);
    const localHeader = Buffer.concat([
      Buffer.from([0x50,0x4B,0x03,0x04]),  // local file signature
      u16le(20),       // version needed: 2.0
      u16le(0),        // flags
      u16le(8),        // compression: deflate
      u16le(0), u16le(0), // mod time/date (zero)
      u32le(crc),
      u32le(compressed.length),
      u32le(file.data.length),
      u16le(nameBuffer.length),
      u16le(0),        // extra field length
      nameBuffer,
      compressed,
    ]);

    centralHeaders.push(Buffer.concat([
      Buffer.from([0x50,0x4B,0x01,0x02]),  // central dir signature
      u16le(20), u16le(20),  // version made by / needed
      u16le(0),              // flags
      u16le(8),              // compression: deflate
      u16le(0), u16le(0),   // mod time/date
      u32le(crc),
      u32le(compressed.length),
      u32le(file.data.length),
      u16le(nameBuffer.length),
      u16le(0), u16le(0),   // extra, comment length
      u16le(0), u16le(0),   // disk number, internal attr
      u32le(0),             // external attr
      u32le(offset),        // local header offset
      nameBuffer,
    ]));

    offset += localHeader.length;
    localHeaders.push(localHeader);
  }

  const centralDir  = Buffer.concat(centralHeaders);
  const centralSize = centralDir.length;
  const centralOff  = offset;

  const eocd = Buffer.concat([
    Buffer.from([0x50,0x4B,0x05,0x06]),  // end of central dir
    u16le(0), u16le(0),                  // disk numbers
    u16le(files.length), u16le(files.length),
    u32le(centralSize),
    u32le(centralOff),
    u16le(0),  // comment length
  ]);

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

// Build a minimal valid .docx from a document.xml string
function buildDocx(documentXml) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

  const relsRoot = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const relsWord = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>`;

  return buildZip([
    { name: "[Content_Types].xml",      data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels",              data: Buffer.from(relsRoot,     "utf8") },
    { name: "word/document.xml",        data: Buffer.from(documentXml,  "utf8") },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(relsWord, "utf8") },
    { name: "word/settings.xml",        data: Buffer.from(settings,     "utf8") },
  ]);
}


function escXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Parse source_map JSON safely
function parseSourceMap(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

// Scan body for all [N] citations used, return sorted unique list of numbers
function citedNumbers(body) {
  const matches = [...body.matchAll(/\[(\d+)\]/g)];
  const nums = [...new Set(matches.map(m => parseInt(m[1], 10)))].sort((a,b)=>a-b);
  return nums;
}

// Rebuild the References section from source_map — guarantees completeness, no duplicates.
// Strips any existing ## 9. References block Claude may have produced, then appends authoritative one.
function rebuildReferences(body, sourceMap) {
  // Remove Claude's References section if present (may be incomplete/duplicated)
  const refHeadingRe = /\n## 9\. References[\s\S]*$/;
  const stripped = body.replace(refHeadingRe, "").trimEnd();

  const nums = citedNumbers(stripped);
  if (!nums.length || !Object.keys(sourceMap).length) return body; // nothing to map

  const lines = ["", "## 9. References", ""];
  for (const n of nums) {
    const src = sourceMap[String(n)];
    if (src) lines.push(`[${n}] ${src.name} — ${src.url}`);
  }
  return stripped + lines.join("\n");
}

// Render [N] tokens as markdown hyperlinks: [N](url)
function resolveInlineMd(text, sourceMap) {
  return text.replace(/\[(\d+)\]/g, (match, n) => {
    const src = sourceMap[n];
    return src && src.url ? `[${n}](${src.url})` : match;
  });
}

// Render [N] tokens as HTML <a> links — text must already be HTML-escaped before calling
function resolveInlineHtml(escapedText, sourceMap) {
  // Replace **bold** → <strong> (text is already escaped so no & < > issues)
  let html = escapedText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Replace `code` → <code>
  html = html.replace(/`([^`]+)`/g, `<code style="background:#0d2137;color:#00ff9d;padding:0.1em 0.4em;border-radius:3px;font-size:0.88em;">$1</code>`);
  // Replace [N] → <a> citation links
  html = html.replace(/\[(\d+)\]/g, (match, n) => {
    const src = sourceMap[n];
    if (src && src.url) {
      return `<a href="${escXml(src.url)}" title="${escXml(src.name)}" target="_blank" style="color:#4fc3f7;font-size:0.78em;vertical-align:super;text-decoration:none;font-weight:bold;border:1px solid #4fc3f744;border-radius:3px;padding:0 0.25em;background:#4fc3f711;">[${n}]</a>`;
    }
    return `<span style="color:#4a6a80;font-size:0.78em;">${match}</span>`;
  });
  return html;
}

function mdToHtmlBody(text, sourceMap) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;

  const isTableRow = l => l.trimStart().startsWith("|") && l.trimEnd().endsWith("|");
  const isSepRow   = l => /^\|[\s|:-]+\|$/.test(l.trim());
  const parseCells = l => l.split("|").slice(1, -1).map(c => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // ── Table block ──────────────────────────────────────────────────────────
    if (isTableRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
      const headers = parseCells(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(parseCells(lines[i])); i++; }

      const headerHtml = headers.map(h =>
        `<th>${resolveInlineHtml(escXml(h), sourceMap)}</th>`
      ).join("");

      const rowsHtml = rows.map((row, ri) => {
        const cells = row.map(cell => {
          const col = cell.includes("CRITICAL") ? "#ef5350"
                    : cell.includes("HIGH")     ? "#ff9800"
                    : cell.includes("MEDIUM")   ? "#ffd700" : "inherit";
          const style = col !== "inherit" ? ` style="color:${col};font-weight:bold;"` : "";
          return `<td${style}>${resolveInlineHtml(escXml(cell), sourceMap)}</td>`;
        }).join("");
        return `<tr class="${ri % 2 === 0 ? "even" : "odd"}">${cells}</tr>`;
      }).join("\n");

      out.push(`<div class="table-wrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`);
      continue;
    }

    // ── Standard elements ────────────────────────────────────────────────────
    if      (line.startsWith("### ")) out.push(`<h3>${resolveInlineHtml(escXml(line.slice(4)), sourceMap)}</h3>`);
    else if (line.startsWith("## "))  out.push(`<h2>${resolveInlineHtml(escXml(line.slice(3)), sourceMap)}</h2>`);
    else if (line.startsWith("# "))   out.push(`<h1>${resolveInlineHtml(escXml(line.slice(2)), sourceMap)}</h1>`);
    else if (line.match(/^[-*] /))    out.push(`<li>${resolveInlineHtml(escXml(line.slice(2)), sourceMap)}</li>`);
    else if (line.startsWith("> "))   out.push(`<blockquote>${resolveInlineHtml(escXml(line.slice(2)), sourceMap)}</blockquote>`);
    else if (!line.trim())            out.push(`<br>`);
    else {
      // Reference section lines: [N] Title — URL
      const refLine = line.match(/^\[(\d+)\] (.+?) — (https?:\/\/\S+)$/);
      if (refLine) {
        out.push(`<p class="ref"><strong>[${escXml(refLine[1])}]</strong> ${escXml(refLine[2])} — <a href="${escXml(refLine[3])}">${escXml(refLine[3])}</a></p>`);
      } else {
        out.push(`<p>${resolveInlineHtml(escXml(line), sourceMap)}</p>`);
      }
    }
    i++;
  }
  return out.join("\n");
}

const HTML_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  html {
    background: #060d14;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  body {
    font-family: 'IBM Plex Mono', 'Courier New', monospace;
    background: #060d14; color: #b0bec5;
    max-width: 960px; margin: 40px auto; padding: 0 32px;
    line-height: 1.75; font-size: 14px;
  }
  h1 { color: #00ff9d; font-size: 1.4rem; margin-top: 2rem; border-bottom: 1px solid #00ff9d44; padding-bottom: 6px; }
  h2 { color: #4fc3f7; font-size: 1.05rem; margin-top: 1.8rem; border-bottom: 1px solid #1a3a4a; padding-bottom: 4px; }
  h3 { color: #ffd700; font-size: 0.95rem; margin-top: 1.2rem; }
  p  { color: #b0bec5; margin: 0.4rem 0; }
  li { color: #b0bec5; margin: 0.3rem 0 0.3rem 1.4rem; }
  blockquote { border-left: 3px solid #00ff9d; padding-left: 1rem; color: #80cbc4; font-style: italic; margin: 0.6rem 0; }
  strong { color: #e2eaf4; }
  code   { background: #0d2137; color: #00ff9d; padding: 0.1em 0.4em; border-radius: 3px; font-size: 0.88em; }
  a      { color: #4fc3f7; }
  .meta  { background: #0a1929; border-left: 4px solid #00ff9d; padding: 12px 18px;
           margin: 18px 0; border-radius: 4px; font-size: 0.78rem; color: #4a6a80; }
  .table-wrap { overflow-x: auto; margin: 1rem 0; }
  table  { border-collapse: collapse; width: 100%; font-size: 0.78rem; }
  th     { background: #0a1929; color: #4fc3f7; padding: 0.45rem 0.9rem;
           text-align: left; border: 1px solid #1a3a4a; white-space: nowrap; letter-spacing: 0.05em; }
  tr.even td { background: #060d14; }
  tr.odd  td { background: #0a1929; }
  td     { padding: 0.35rem 0.9rem; border: 1px solid #1a3a4a; vertical-align: top; color: #b0bec5; }
  .ref   { font-size: 0.8rem; color: #4a6a80; margin: 0.2rem 0; }
  .ref a { color: #2a6a8a; word-break: break-all; }
  @media print {
    html, body { background: #060d14 !important; margin: 0; }
    body { padding: 20px; max-width: 100%; }
  }
`;

// ─── Report export ────────────────────────────────────────────────────────────
app.get("/api/reports/:id/export", (req, res) => {
  const id  = Number(req.params.id);
  const fmt = (req.query.format || "md").toLowerCase().trim();
  console.log(`Export → id=${id} format=${fmt}`);

  if (!["md","html","pdf","docx"].includes(fmt))
    return res.status(400).json({ error: `Unknown format '${fmt}'. Use md, html, pdf or docx.` });

  const row = stmts.getReport.get(id);
  if (!row) return res.status(404).json({ error: `Report ${id} not found.` });

  const sourceMap = parseSourceMap(row.source_map);
  const title = `TI Briefing — ${row.timestamp}`;
  const cost  = typeof row.total_cost === "number" ? `$${row.total_cost.toFixed(4)}` : "n/a";
  const meta  = `Model: ${row.model_name} | Sources: ${row.sources} | Window: ${row.date_from} to ${row.date_to} | Cost: ${cost} | Tokens: ${row.input_tokens} in / ${row.output_tokens} out`;

  // Rebuild references authoritatively from source_map before exporting
  const body = rebuildReferences(row.body || "(empty report)", sourceMap);

  // ── Markdown ──────────────────────────────────────────────────────────────
  if (fmt === "md") {
    // Resolve [N] → [N](url) markdown hyperlinks
    const resolvedBody = resolveInlineMd(body, sourceMap);
    const out = `# ${title}\n\n_${meta}_\n\n---\n\n${resolvedBody}\n`;
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ti-report-${id}.md"`);
    return res.send(out);
  }

  // ── HTML ──────────────────────────────────────────────────────────────────
  if (fmt === "html") {
    const out = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escXml(title)}</title>
<style>${HTML_CSS}</style></head>
<body>
<h1>${escXml(title)}</h1>
<div class="meta">${escXml(meta)}</div>
${mdToHtmlBody(body, sourceMap)}
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ti-report-${id}.html"`);
    return res.send(out);
  }

  // ── PDF (print-ready HTML, opens print dialog) ────────────────────────────
  if (fmt === "pdf") {
    const out = `<!DOCTYPE html>
<html lang="en" style="background:#060d14;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;">
<head><meta charset="UTF-8"><title>${escXml(title)}</title>
<style>${HTML_CSS} @page { margin: 18mm; background: #060d14; }</style>
</head>
<body style="background:#060d14;">
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 600); };<\/script>
<h1>${escXml(title)}</h1>
<div class="meta">${escXml(meta)}</div>
${mdToHtmlBody(body, sourceMap)}
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="ti-report-${id}.pdf"`);
    return res.send(out);
  }

  // ── DOCX (WordprocessingML — tables, bold, superscript citations) ───────────
  if (fmt === "docx") {
    const isTableRow = l => l.trimStart().startsWith("|") && l.trimEnd().endsWith("|");
    const isSepRow   = l => /^\|[\s|:-]+\|$/.test(l.trim());
    const parseCells = l => l.split("|").slice(1, -1).map(c => c.trim());

    // Convert a plain text line (no markup) into w:r runs handling **bold** and [N]
    const lineToRuns = line => {
      const parts = line.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
      return parts.map(part => {
        if (/^\*\*[^*]+\*\*$/.test(part))
          return `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escXml(part.slice(2,-2))}</w:t></w:r>`;
        if (/^\[\d+\]$/.test(part))
          return `<w:r><w:rPr><w:vertAlign w:val="superscript"/><w:color w:val="4fc3f7"/></w:rPr><w:t>${escXml(part)}</w:t></w:r>`;
        return part ? `<w:r><w:t xml:space="preserve">${escXml(part)}</w:t></w:r>` : "";
      }).join("");
    };

    const cellXml = (cellText, isHeader) => {
      const shading = isHeader
        ? `<w:shd w:val="clear" w:color="auto" w:fill="0A1929"/>`
        : `<w:shd w:val="clear" w:color="auto" w:fill="060D14"/>`;
      const rPr = isHeader ? `<w:rPr><w:b/><w:color w:val="4fc3f7"/></w:rPr>` : `<w:rPr><w:color w:val="B0BEC5"/></w:rPr>`;
      const border = `<w:top w:val="single" w:sz="4" w:color="1A3A4A"/><w:left w:val="single" w:sz="4" w:color="1A3A4A"/><w:bottom w:val="single" w:sz="4" w:color="1A3A4A"/><w:right w:val="single" w:sz="4" w:color="1A3A4A"/>`;
      return `<w:tc><w:tcPr>${shading}<w:tcBorders>${border}</w:tcBorders><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:r>${rPr}<w:t xml:space="preserve">${escXml(cellText)}</w:t></w:r></w:p></w:tc>`;
    };

    const lines = body.split("\n");
    const xmlParts = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Table block
      if (isTableRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
        const headers = parseCells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) { rows.push(parseCells(lines[i])); i++; }

        const colCount = headers.length;
        const colWidth = Math.floor(9360 / colCount); // 9360 dxa = ~6.5 inches
        const gridCols = Array(colCount).fill(`<w:gridCol w:w="${colWidth}"/>`).join("");
        const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers.map(h => cellXml(h, true)).join("")}</w:tr>`;
        const bodyRows = rows.map(row =>
          `<w:tr>${row.map((c, ci) => cellXml(ci < headers.length ? c : "", false)).join("")}</w:tr>`
        ).join("");
        xmlParts.push(`<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="1A3A4A"/><w:insideV w:val="single" w:sz="4" w:color="1A3A4A"/></w:tblBorders></w:tblPr><w:tblGrid>${gridCols}</w:tblGrid>${headerRow}${bodyRows}</w:tbl><w:p/>`);
        continue;
      }

      if (line.startsWith("### "))
        xmlParts.push(`<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>${escXml(line.slice(4))}</w:t></w:r></w:p>`);
      else if (line.startsWith("## "))
        xmlParts.push(`<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${escXml(line.slice(3))}</w:t></w:r></w:p>`);
      else if (line.startsWith("# "))
        xmlParts.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escXml(line.slice(2))}</w:t></w:r></w:p>`);
      else if (line.match(/^[-*] /))
        xmlParts.push(`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${lineToRuns(line.slice(2))}</w:p>`);
      else if (!line.trim())
        xmlParts.push(`<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`);
      else {
        const refLine = line.match(/^\[(\d+)\] (.+?) — (https?:\/\/\S+)$/);
        if (refLine)
          xmlParts.push(`<w:p><w:r><w:rPr><w:b/><w:color w:val="4fc3f7"/></w:rPr><w:t xml:space="preserve">[${escXml(refLine[1])}] </w:t></w:r><w:r><w:rPr><w:color w:val="4A6A80"/></w:rPr><w:t xml:space="preserve">${escXml(refLine[2])} — ${escXml(refLine[3])}</w:t></w:r></w:p>`);
        else
          xmlParts.push(`<w:p>${lineToRuns(line)}</w:p>`);
      }
      i++;
    }

    const docxml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:color w:val="00FF9D"/></w:rPr><w:t>${escXml(title)}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:color w:val="4A6A80"/><w:sz w:val="18"/></w:rPr><w:t>${escXml(meta)}</w:t></w:r></w:p>
<w:p/>
${xmlParts.join("\n")}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;

    const docxBuffer = buildDocx(docxml);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="ti-report-${id}.docx"`);
    return res.send(docxBuffer);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(3001, () => {
  console.log("\n✅  TI Agent server → http://localhost:3001");
  console.log("    Exports : md | html | pdf | docx");
  console.log("    Routes  : /api/analyze | /api/config | /api/fetch-feeds");
  console.log("              /api/feeds/custom | /api/reports | /api/costs\n");
});
