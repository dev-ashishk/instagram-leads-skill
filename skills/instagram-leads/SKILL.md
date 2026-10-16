---
name: instagram-leads
description: Find business leads on Instagram from public Google results (by default Indian online shops that take orders over DMs or WhatsApp, or run on Shopify or Dukaan, but any business a search can describe), review them in a local page and draft first messages. Never scrapes Instagram. Use when asked to find Instagram leads, prospect businesses on Instagram, run or tune lead searches, review or shortlist leads, or draft outreach messages for them.
---

# Instagram lead finder

The tool is in the `tool/` folder next to this file (this skill's base directory). It needs Node 22 or newer and has no dependencies.

- `tool/server.mjs`: local server and bio parsing.
- `tool/index.html`: the review page at http://localhost:5600, with the bookmarklet.
- `tool/queries.json`: saved searches. `tool/config.json`: product, pitch, country and message templates.
- `tool/test.mjs`: parser and security checks. Run `node tool/test.mjs` after changing the server.

User data lives in `~/.instagram-leads/` (override with `INSTAGRAM_LEADS_HOME`): `leads.json`, and optional `config.json` / `queries.json` that replace the bundled ones. Edit the copies in `~/.instagram-leads/`, never the bundled files, so updates keep the user's changes.

## Start it

1. Check it is not already running: `lsof -iTCP:5600 -sTCP:LISTEN`.
2. Start it from this skill's base directory and open the page:

```bash
nohup node tool/server.mjs > /tmp/instagram-leads.log 2>&1 &
open http://localhost:5600   # xdg-open on Linux
```

3. First use only: if `~/.instagram-leads/config.json` does not exist, or its `product` or `pitch` still starts with `[`, ask the user what they sell and for a one-line pitch, then write it:

```bash
mkdir -p ~/.instagram-leads && cp tool/config.json ~/.instagram-leads/config.json
```

Set `product` to the name and `pitch` to a clause that completes "I work on {product}, which ...", for example "helps Instagram businesses take orders and payments online". Change `country` if the user targets leads outside India.

Stop the server when the work is done: `kill $(lsof -tiTCP:5600 -sTCP:LISTEN)`.

## Find leads

No API key is needed. Pick the way that fits:

1. **Claude searches (the default)**: search with your own web search tool, restricted to `instagram.com` (allowed domains), using the category and selling phrases without `site:`. For every result that is a profile (`instagram.com/<handle>/`, not `/p/` or `/reel/`), build `{link, title, snippet}`. Put the follower count and bio details the result showed in `snippet`, copied as written. Never invent or guess details. Then save them:

```bash
curl -s localhost:5600/api/import -H 'Content-Type: application/json' \
  -d '{"source":"claude","query":"kurti dm to order cod","results":[{"link":"https://www.instagram.com/<handle>/","title":"<Name> (@<handle>) • Instagram photos and videos","snippet":"<followers and bio text from the result>"}]}'
```

Each search returns only a few profiles, so run several variations (different categories, cities and phrases) and report how many were new.

2. **The user wants to search by hand**: point them to the bookmarklet on the review page. They drag it to the bookmarks bar, search Google, press it on the results page, then press **Save to leads**.

## Review and update

```bash
curl -s localhost:5600/api/state   # all leads, recent searches, presets, config
curl -s -X PATCH localhost:5600/api/leads/<handle> -H 'Content-Type: application/json' \
  -d '{"status":"shortlisted","notes":"..."}'
curl -s localhost:5600/api/export.csv -o leads.csv
```

Statuses: new, shortlisted, contacted, replied, won, not_a_fit.

## Writing good searches

Combine a category (kurti, jewellery, candles, skincare, snacks) with a selling phrase in quotes: "dm to order", "order on whatsapp", "cod available", "pan india delivery", "wa.me", "mydukaan.io", "myshopify.com". Look at the results after each new query. Drop queries that return mostly resellers, agencies or influencers, and add good ones to `~/.instagram-leads/queries.json`.

## Signals

- whatsapp, dm_to_order: sells by chat.
- shopify, dukaan, other_store, linktree, has_site: what storefront they use today.
- cod, ships_india: active business shipping nationally.

The suggested message is picked from `config.json` by the strongest signal: `shopify`, then `store` (Dukaan or another store), then `chat`, then `default`. Templates can use `{name}`, `{product}`, `{pitch}` and `{channels}`.

## Rules

- Never scrape instagram.com or facebook.com, never open profiles in an automated browser, and never automate logins or DMs. It breaks Meta's terms and gets accounts banned.
- Never automate Google searches in a browser. Use the web search tool or the user's own searches.
- A person sends every message: copy the suggested text and DM by hand (about 20 to 30 a day), or email when the bio lists an address. Never send cold WhatsApp template messages.
- Keep only what the lead published for business: name, handle, bio, business email or phone. When someone says no, set them to not_a_fit and do not contact them again.
