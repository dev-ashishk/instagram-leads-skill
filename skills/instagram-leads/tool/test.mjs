// node test.mjs  - checks the parser on result shapes Google returns for Instagram.
import assert from 'node:assert/strict'
import { handleFrom, parseResult, signals, csvCell, allowed, whatsappLink } from './server.mjs'

assert.equal(handleFrom('https://www.instagram.com/mitti.and.co/'), 'mitti.and.co')
assert.equal(handleFrom('https://www.instagram.com/Mitti_Co/p/C1x2y3/'), 'mitti_co')
assert.equal(handleFrom('https://www.instagram.com/p/C1x2y3/'), null)
assert.equal(handleFrom('https://www.instagram.com/reel/C1x2y3/'), null)
assert.equal(handleFrom('https://www.instagram.com/explore/tags/kurti/'), null)

const l = parseResult({
  link: 'https://www.instagram.com/rangreza.kurtis/',
  title: 'Rangreza Kurtis (@rangreza.kurtis) • Instagram photos and videos',
  snippet: '12.5K Followers, 310 Following, 842 Posts - Handblock kurtis. DM to order. COD available. Shipping all over India. WhatsApp 98765 43210. rangreza.orders@gmail.com',
}, 'q')
assert.equal(l.handle, 'rangreza.kurtis')
assert.equal(l.name, 'Rangreza Kurtis')
assert.equal(l.followers, 12500)
assert.equal(l.posts, 842)
assert.equal(l.email, 'rangreza.orders@gmail.com')
assert.equal(l.phone, '9876543210')
for (const s of ['whatsapp', 'dm_to_order', 'cod', 'ships_india']) assert.ok(l.signals.includes(s), s)
assert.ok(!l.signals.includes('has_site'), 'gmail is not a website')

assert.deepEqual(signals('shop at brand.myshopify.com'), ['shopify'])
assert.ok(signals('order at mydukaan.io/brand').includes('dukaan'))
assert.ok(signals('visit www.brand.in').includes('has_site'))
assert.equal(parseResult({ link: 'https://www.instagram.com/p/abc/', title: 'x', snippet: '' }, 'q'), null)

// WhatsApp links keep every digit and add 91 only to 10-digit numbers.
assert.equal(whatsappLink('9876543210'), 'https://wa.me/919876543210')
assert.equal(whatsappLink('+919812345678'), 'https://wa.me/919812345678')
assert.equal(whatsappLink('6123456789'), 'https://wa.me/916123456789')
assert.equal(whatsappLink(null), null)

// Spreadsheet formulas in a bio must not run when the CSV is opened.
assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
assert.equal(csvCell('plain'), '"plain"')

// Only local, same-origin JSON requests are accepted.
const req = (method, headers) => ({ method, headers: { host: 'localhost:5600', ...headers } })
assert.ok(allowed(req('GET', {}), 5600))
assert.ok(allowed(req('POST', { 'content-type': 'application/json' }), 5600))
assert.ok(allowed(req('POST', { 'content-type': 'application/json', origin: 'http://localhost:5600' }), 5600))
assert.ok(!allowed(req('POST', { 'content-type': 'text/plain' }), 5600), 'form posts from other sites')
assert.ok(!allowed(req('POST', { 'content-type': 'application/json', origin: 'https://evil.example' }), 5600), 'other origins')
assert.ok(!allowed(req('GET', { host: 'evil.example:5600' }), 5600), 'DNS rebinding')
console.log('ok')
