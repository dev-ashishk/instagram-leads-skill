// Instagram lead finder: finds Instagram sellers through Google results, never by scraping Instagram.
// Leads arrive two ways: Claude's web search, or the browser bookmarklet on a Google results page.
// Run: node server.mjs   then open http://localhost:5600
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const DIR = dirname(fileURLToPath(import.meta.url))
// Your key, leads and any config overrides live here, outside the install, so updates never touch them.
const HOME = process.env.INSTAGRAM_LEADS_HOME ?? join(homedir(), '.instagram-leads')
const DATA = join(HOME, 'leads.json')
const PORT = Number(process.env.PORT ?? 5600)
// ~/.instagram-leads/<name> wins over the bundled default.
const config = name => JSON.parse(readFileSync(existsSync(join(HOME, name)) ? join(HOME, name) : join(DIR, name), 'utf8'))

// ponytail: one JSON file, rewritten whole. Fine to a few thousand leads; move to SQLite past that.
const load = () => (existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : { leads: {}, runs: [] })
const save = db => {
  mkdirSync(HOME, { recursive: true, mode: 0o700 })
  writeFileSync(DATA + '.tmp', JSON.stringify(db, null, 1), { mode: 0o600 })
  renameSync(DATA + '.tmp', DATA)
}

const NOT_HANDLES = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'about', 'legal', 'directory', 'web', 'developer'])

// instagram.com/<handle>/ or instagram.com/<handle>/p/<id> -> handle
export function handleFrom(url) {
  const m = String(url).match(/instagram\.com\/([A-Za-z0-9._]{1,30})(?:\/|$|\?)/)
  return m && !NOT_HANDLES.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null
}

const num = s => {
  const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/)
  if (!m) return null
  return Math.round(parseFloat(m[1]) * (m[2].toLowerCase() === 'm' ? 1e6 : m[2].toLowerCase() === 'k' ? 1e3 : 1))
}

// Signals read from the result title + snippet. Each one maps to a message template.
export function signals(text) {
  const t = text.toLowerCase()
  const s = []
  if (/wa\.me|whatsapp|whats app/.test(t)) s.push('whatsapp')
  if (/dm (to|for) (order|price|details|booking)|dm us|order via dm|dm now/.test(t)) s.push('dm_to_order')
  if (/\bcod\b|cash on delivery/.test(t)) s.push('cod')
  if (/linktr\.ee|bio\.link|linkin\.bio|beacons\.ai/.test(t)) s.push('linktree')
  if (/dukaan|mydukaan/.test(t)) s.push('dukaan')
  if (/myshopify|shopify/.test(t)) s.push('shopify')
  if (/instamojo|wixsite|woocommerce|bikayi|shiprocket\.co/.test(t)) s.push('other_store')
  if (/(ship|deliver)\w* (all over|across|pan) india|pan india|all india/.test(t)) s.push('ships_india')
  if (/\.(com|in|co|store|shop)\b/.test(t.replace(/\S+@\S+|instagram\.com|wa\.me|linktr\.ee/g, '')) && !s.includes('shopify')) s.push('has_site')
  return s
}

// wa.me wants the country code and digits only. A 10-digit number is Indian, the format the parser reads.
export const whatsappLink = phone => {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  return 'https://wa.me/' + (d.length === 10 ? '91' + d : d)
}
// What the page gets for a lead: the stored fields plus links worked out here, not in the page.
const view = l => ({ ...l, whatsapp: whatsappLink(l.phone) })

export function parseResult(r, query) {
  const handle = handleFrom(r.link)
  if (!handle) return null
  const title = String(r.title ?? '').slice(0, 300)
  const snippet = String(r.snippet ?? '').slice(0, 2000)
  const text = `${title} ${snippet}`
  const name = title.replace(/\s*[•|·-]\s*Instagram.*$/i, '').replace(/\s*\(@[^)]*\)\s*/, ' ').replace(/ on Instagram.*$/i, '').trim()
  const followers = text.match(/([\d.,]+\s*[KkMm]?)\+?\s*Followers/i)
  const posts = text.match(/([\d.,]+\s*[KkMm]?)\s*Posts/i)
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  const phone = text.match(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/)
  return {
    handle,
    name: name || handle,
    url: 'https://www.instagram.com/' + handle + '/',
    bio: snippet,
    followers: followers ? num(followers[1]) : null,
    posts: posts ? num(posts[1]) : null,
    email: email ? email[0] : null,
    phone: phone ? phone[0].replace(/[\s-]/g, '') : null,
    signals: signals(text),
    query,
  }
}

// Adds results to the saved leads. Status and notes on known sellers are kept.
function merge(results, query, source) {
  const db = load()
  let found = 0, fresh = 0
  for (const r of results) {
    const lead = parseResult(r, query)
    if (!lead) continue
    found++
    const old = db.leads[lead.handle]
    if (!old) fresh++
    db.leads[lead.handle] = old
      ? { ...old, ...lead, signals: [...new Set([...old.signals, ...lead.signals])], email: lead.email ?? old.email, phone: lead.phone ?? old.phone, followers: lead.followers ?? old.followers, posts: lead.posts ?? old.posts, bio: lead.bio || old.bio, query: old.query }
      : { ...lead, status: 'new', notes: '', addedAt: new Date().toISOString() }
  }
  db.runs.unshift({ query, source, found, fresh, at: new Date().toISOString() })
  db.runs = db.runs.slice(0, 200)
  save(db)
  return { found, fresh }
}

// Leading = + - @ make spreadsheets run the cell as a formula; a quote disarms it.
export const csvCell = v => {
  const s = String(v ?? '')
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`
}
const COLS = ['handle', 'name', 'url', 'followers', 'posts', 'email', 'phone', 'signals', 'status', 'notes', 'bio', 'query', 'addedAt']

// Only this machine's browser tab and local tools may talk to the server.
// Host check stops DNS rebinding; Origin + JSON content type stop other websites posting to it.
export function allowed(req, port = PORT) {
  const ok = [`localhost:${port}`, `127.0.0.1:${port}`]
  if (!ok.includes(req.headers.host)) return false
  if (req.method === 'GET' || req.method === 'HEAD') return true
  const origin = req.headers.origin
  if (origin && !ok.some(h => origin === 'http://' + h)) return false
  return (req.headers['content-type'] ?? '').startsWith('application/json')
}

const body = req => new Promise((ok, bad) => {
  let b = ''
  req.on('data', c => {
    b += c
    if (b.length > 1e6) { bad(new Error('Request too large')); req.destroy() }
  })
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}) } catch { bad(new Error('Body must be JSON')) } })
})
const send = (res, code, data, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
  res.end(type === 'application/json' ? JSON.stringify(data) : data)
}

// The page's one inline script is allowed by hash, so injected markup can never run script.
const PAGE = readFileSync(join(DIR, 'index.html'))
const SCRIPT_HASH = createHash('sha256').update(String(PAGE).match(/<script>([\s\S]*?)<\/script>/)[1]).digest('base64')
const CSP = `default-src 'none'; script-src 'sha256-${SCRIPT_HASH}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`

const STATUSES = ['new', 'shortlisted', 'contacted', 'replied', 'won', 'not_a_fit']
const SOURCES = ['claude', 'bookmarklet', 'manual']

const server = createServer(async (req, res) => {
  if (!allowed(req)) return send(res, 403, { message: 'Requests are only accepted from this computer.' })
  const url = new URL(req.url, 'http://localhost')
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.setHeader('Content-Security-Policy', CSP)
      res.setHeader('Referrer-Policy', 'no-referrer')
      return send(res, 200, PAGE, 'text/html; charset=utf-8')
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const db = load()
      return send(res, 200, { leads: Object.values(db.leads).map(view), runs: db.runs.slice(0, 20), presets: config('queries.json'), config: config('config.json') })
    }
    if (req.method === 'POST' && url.pathname === '/api/import') {
      const { query, results, source = 'manual' } = await body(req)
      if (!Array.isArray(results) || !results.length) return send(res, 400, { message: 'No results to import.' })
      if (!SOURCES.includes(source)) return send(res, 400, { message: `Unknown source ${source}` })
      return send(res, 200, merge(results.slice(0, 100), String(query ?? '').slice(0, 300).trim() || 'imported', source))
    }
    const m = url.pathname.match(/^\/api\/leads\/([a-z0-9._]+)$/)
    if (req.method === 'PATCH' && m) {
      const db = load()
      const lead = db.leads[m[1]]
      if (!lead) return send(res, 404, { message: 'Lead not found' })
      const { status, notes } = await body(req)
      if (status !== undefined) {
        if (!STATUSES.includes(status)) return send(res, 400, { message: `Unknown status ${status}` })
        lead.status = status
      }
      if (notes !== undefined) lead.notes = String(notes).slice(0, 2000)
      save(db)
      return send(res, 200, view(lead))
    }
    if (req.method === 'GET' && url.pathname === '/api/export.csv') {
      const rows = Object.values(load().leads).map(l => COLS.map(c => csvCell(Array.isArray(l[c]) ? l[c].join(' ') : l[c])).join(','))
      res.setHeader('Content-Disposition', 'attachment; filename="instagram-leads.csv"')
      return send(res, 200, [COLS.join(','), ...rows].join('\n'), 'text/csv; charset=utf-8')
    }
    send(res, 404, { message: 'Not found' })
  } catch (e) {
    send(res, 500, { message: e.message })
  }
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '127.0.0.1', () => console.log('Lead finder on http://localhost:' + PORT + '  (data in ' + HOME + ')'))
}
