# TI Agent — Changelog

---

## [Unreleased — current]

### Added
- **Real RSS/Atom feed fetching** — `POST /api/fetch-feeds` endpoint fetches all selected feeds in parallel, parses XML, filters articles to the date window, and returns real `{title, url, date, summary}` items. Claude now analyzes actual content instead of hallucinating from training data.
- **Inline clickable citations** — report citations `[N]` now link to the specific article URL (not the feed homepage). `renderInline()` parser converts `[N]` tokens to styled `<a>` links with hover states.
- **sourceMap persistence** — `source_map TEXT` column in the `reports` table stores the citation-to-URL mapping as JSON so citations remain clickable when viewing historical reports.
- **Two-phase loading UI** — generate button and spinner distinguish `"fetching"` (RSS download) from `"analyzing"` (Claude API) phases with separate labels and icons.
- **Delete any feed** — all feeds (builtin and custom) now have a delete button. Builtin feed deletions are tracked in `deletedIds[]` persisted in the config table. Custom feed deletions hit `DELETE /api/feeds/custom/:id` as before.
- **Inline confirm on delete** — delete confirmation is inline in the feed pill (`del? / ✕`) rather than `window.confirm()`.
- **DB migration on startup** — `ALTER TABLE reports ADD COLUMN source_map TEXT` runs at startup with error suppression so existing databases upgrade automatically.

### Changed
- `buildPrompt()` now takes real fetched `articles[]` instead of `sources[]`. Each article is a numbered citation entry with title, URL, date, and 400-char summary.
- `buildSourceMap()` now maps article index → `{name, url}` using actual article URLs.
- Cost estimator updated: pre-flight estimate is now `1200 + feeds × 1500` tokens (previously `800 + feeds × 300`), reflecting real article content in the prompt.
- `disabledIds` is now also persisted in the config table (was only in memory before).

### Fixed
- Zero-articles guard: if no articles are found in the date window, the user gets a clear error message instead of calling Claude with empty content.

---

## [v2.1] — Feed fetch infrastructure + export fix

### Added
- **Config export/import** — `GET /api/config/export` downloads a full JSON snapshot of settings + custom feeds. `POST /api/config/import` restores it. UI has `↓ Export config.json` and `↑ Import config.json` buttons in the CONFIG tab.

### Fixed
- **`app.options("*", cors())` crash on startup** — bare `*` wildcard is invalid in `path-to-regexp` v8 (bundled with Express 5). Removed; `cors()` middleware handles preflight automatically.
- **Express 4 → Express 5** — Node 22 ships with a `path-to-regexp` version incompatible with Express 4. Upgraded to `express@5`.

---

## [v2.0] — Citations, feed deletion, DB persistence fixes

### Added
- **Numbered source citations in prompt** — sources are now numbered `[1]...[N]` and Claude is instructed to cite them inline. A `## 9. References` section is requested.
- **`renderInline()` function** — parses bold `**text**`, inline `` `code` ``, and `[N]` citation tokens within any text node.
- **`sourceMap` state** — maps citation numbers to `{name, url}` for the current report; passed to `renderMarkdown()`.
- **Delete button on all feeds** — builtin feeds get a `🗑` button with inline confirm. `deletedIds` state tracks deletions and is persisted in the config table.
- **`confirmDeleteId` state** — inline confirm flow replaces `window.confirm()`.

### Fixed
- **`runRecord is not defined` lint error** — `const runRecord` was declared inside the first `try {}` block but referenced in the second. Changed to `let runRecord = null` declared before both blocks.
- **DB not visible in iCloud Drive** — SQLite WAL journal files conflict with iCloud sync. Moved project to `~/Downloads/ti-agent` (local filesystem).
- **History capped at 10** — removed `.slice(0, 10)` from load and `.slice(0, 9)` from in-session add. All reports now shown.
- **Export buttons always "Saving…"** — replaced `String(h.id).length < 13` hack with `saving` flag on the record.
- **`id` and `clientId` same-tick collision** — separated into `const clientId = Date.now()` then assigned to both fields.

---

## [v1.3] — Report persistence & export

### Added
- **Report persistence to SQLite** — reports saved via `POST /api/reports`, loaded on startup via `GET /api/reports`.
- **Export formats** — MD, HTML, PDF (print-ready HTML), DOCX (WordprocessingML XML).
- **`saving` flag on report records** — export buttons are disabled while the DB save is in progress; show `saveFailed` state if save fails.
- **`clientId` tracking** — temp `Date.now()` ID used until the DB returns a real integer ID; swapped atomically via `setHistory(p => p.map(...))`.
- **Server body limit raised to 16MB** — large reports were rejected by Express's default 100KB JSON limit.

### Fixed
- **Reports disappearing on refresh** — DB save was silently failing because `fetch()` doesn't throw on HTTP errors. Added `!res2.ok` check and explicit throw.
- **Custom feeds not saving** — `xmlUrl: f.xmlUrl || f.url || ""` fallback added; previously rejected feeds that only had a `url` field.

---

## [v1.2] — Config persistence & race condition fix

### Added
- **Config persistence** — all UI state (selected feeds, model, date window, query, schedule, tokens) persisted to SQLite via debounced PUT on change.
- **`dbLoaded` gate** — startup config load sets `dbLoaded = true`; the persist effect returns early until this is set. Prevents default state from overwriting saved config on mount.
- **`disabledIds` state** — feeds can be disabled (greyed out, excluded from analysis) without being deselected.
- **Custom feed persistence** — custom feeds saved to `custom_feeds` table; loaded on startup.

### Fixed
- **Config PUT 404** — `apiFetch` helper was colliding with the `x-api-key` header. Replaced with direct `fetch()` calls for report and config endpoints.

---

## [v1.1] — API key & proxy fixes

### Fixed
- **Safari password field issues** — changed API key input to `type="text"` with CSS `WebkitTextSecurity: disc` to avoid Safari's password manager and autofill.
- **CRA proxy intercepting fetch** — removed `"proxy": "http://localhost:3001"` from `package.json`. All fetch calls now use explicit `http://localhost:3001/api/...` absolute URLs.
- **JSX parse errors** — fixed multiple: bare Unicode characters in JSX strings, duplicate style keys, single quotes inside double-quoted JSX strings, Unicode ellipsis in placeholders, apostrophe in feed name string.
- **Optional chaining `?.` in JSX** — CRA's Babel config doesn't support `?.` in JSX attribute positions. Replaced all with `(x||{default}).prop` pattern.
- **Nullish coalescing `??` in JSX** — same Babel issue; replaced with `||`.

---

## [v1.0] — Initial build

### Added
- React frontend with 5 tabs: CONFIG, REPORT, COST & FORECAST, HISTORY, BUILD GUIDE
- Express backend with SQLite via `better-sqlite3`
- 97 builtin security feeds across 6 categories
- Feed search, per-category select-all/deselect-all
- Model selector (Claude Haiku 4.5, Sonnet 4.5, Opus 4.5)
- Date window presets (6h, 12h, 24h, 3d, 7d, 14d, 30d, custom)
- Custom feed addition with name/URL/category
- Cost & forecast tab: pre-flight estimator, estimation accuracy tracker, forecast engine, budget tracker, run ledger
- Anthropic API proxy at `POST /api/analyze`
- TLP:GREEN + AI-GENERATED report header badges
