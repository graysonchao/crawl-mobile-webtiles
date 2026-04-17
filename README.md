# crawl-mobile-webtiles

[![Run on Replit](https://replit.com/badge/github/graysonchao/crawl-mobile-webtiles)](https://replit.com/github.com/graysonchao/crawl-mobile-webtiles) · [Deploy to Render](https://render.com/deploy?repo=https://github.com/graysonchao/crawl-mobile-webtiles)

A tiny Node.js proxy that makes [Dungeon Crawl Stone Soup](https://crawl.develz.org/)
WebTiles playable on a phone.

It sits between your browser and an upstream DCSS WebTiles server. HTTP and
WebSocket traffic are forwarded untouched; the main HTML response is rewritten
to inject

- a mobile viewport meta tag and touch-friendly CSS,
- an on-screen keyboard overlay with vi-keys + common game commands,
  inspired by the [jbak2-crawl](https://github.com/roman-yagodin/jbak2-crawl)
  Android layout.

The upstream WebTiles client already knows how to read `event.which`, so the
overlay just dispatches synthesized `KeyboardEvent`s — no custom WebSocket
protocol work is required.

## Quick start

### Hosted on Replit (phone-friendly, no GitHub auth)

Tap the **Run on Replit** button above (or paste the URL directly — the
`github.com/...` path triggers Replit's *rapid import* which is a plain
`git clone` into a new Repl; the `github/...` path goes through the Replit
Agent LLM, which you probably don't want touching the code). Rapid import
pulls the repo as a public tarball and doesn't ask for any GitHub OAuth
grant.

1. Sign in to Replit with any provider (Google, email, etc.) if you aren't
   already.
2. Replit reads `.replit`, provisions Node 20, and runs `npm install` then
   `npm start`. Logs are in the *Console* pane.
3. Once the server prints `mobile-webtiles proxy listening on …`, tap the
   *Webview* pane (or its pop-out button) to get a `https://<slug>.replit.dev`
   URL. Open that on your phone and log in with your WebTiles account.
4. To point at a different upstream, open the *Secrets* (lock icon) panel
   and edit `DCSS_UPSTREAM`. Our server re-reads it on restart.

Free-tier gotcha: the Repl goes to sleep after ~5 minutes of inactivity and
takes 10-30 s to wake on the next request. For always-on you need a paid
Replit *Deployment* (or use Render / Fly).

### Hosted on Render

The `render.yaml` blueprint also works if you prefer Render. Tap **Deploy to
Render** above and authorize GitHub access. Sleeps after ~15 min idle on the
free plan; $7/mo keeps it always-on.

### Local

```sh
npm install
DCSS_UPSTREAM=https://crawl.project357.org PORT=3000 npm start
```

Then open `http://<your-host>:3000` on your phone. Log in with your normal
WebTiles account, pick a game, and play.

### Environment variables

| Var             | Default                             | Purpose                                                |
| --------------- | ----------------------------------- | ------------------------------------------------------ |
| `DCSS_UPSTREAM` | `https://crawl.project357.org`      | Upstream WebTiles server (https or http).              |
| `PORT`          | `3000`                              | Port the proxy listens on.                             |
| `HOST`          | `0.0.0.0`                           | Interface the proxy binds to.                          |

Some popular public servers:

- `https://crawl.project357.org` (CPO)
- `https://cbro.berotato.org:8443` (CBRO)
- `https://crawl.kelbi.org` (CKO)
- `http://crawl.akrasiac.org:8080` (CAO)

Set `DCSS_UPSTREAM` to any of them.

## Keyboard

Five panels, switched by the buttons on the top bar:

- **Game** — 3×3 vi-key D-pad (y k u / h . l / b j n) plus a 3×3 grid with
  the most common commands: `i` inventory, `g`/`,` pick up, `o` auto-explore,
  `5` rest, `s` search / wait, `x` look, `<` / `>` stairs.
- **Act** — second page of game actions: wield/wear/quaff/read/cast, plus
  `Ctrl-G` travel, `Ctrl-F` find, `Ctrl-A` autofight.
- **abc** — QWERTY for entering character names and chat.
- **123** — digits and punctuation.
- **Fn** — F1–F12 (for macros).

The bottom bar (always visible) has Esc, Tab, Ctrl, Shift, Alt, Space,
Backspace and Enter. Modifier keys are sticky for one tap; double-tap to
lock (caps-lock style).

Tap the `▾` button in the top-right to slide the overlay away when you want
to read a long message pane.

## How it works

1. The proxy is a plain Node HTTP server fronting
   [`http-proxy`](https://github.com/http-party/node-http-proxy).
2. HTML responses are streamed into memory, decompressed if needed, and
   rewritten to add our `<meta viewport>`, our CSS, and our script.
3. `Content-Security-Policy`, `X-Frame-Options` and `Strict-Transport-Security`
   headers are dropped from the proxied response so the injection isn't
   blocked. `Set-Cookie` is rewritten to drop the upstream `Domain=` and
   `Secure` attributes, so cookies stick to your proxy host.
4. WebSocket upgrades for `/socket` are forwarded to the upstream transparently.
5. On the client, `public/mobile.js` builds the keyboard DOM and, on each tap,
   dispatches a `keydown`/`keypress`/`keyup` stack with `keyCode`, `which`
   and `charCode` pinned via `Object.defineProperty`, which is what the
   WebTiles client reads.

## Caveats

- This is a proxy, not a reimplementation. You still need an upstream WebTiles
  server to play on, and you still need a WebTiles account there.
- Don't run the proxy on the open internet without HTTPS: passwords are sent
  over your own connection first.
- The overlay is a best-effort touch UI. Some menus (e.g. spell memorization
  via lettered keys) may still want letter keys from the `abc` panel.

## Files

- `server.js` — proxy + HTML rewriter.
- `public/mobile.css` — viewport / overlay styling.
- `public/mobile.js` — touch keyboard + synthetic `KeyboardEvent` dispatch.

## License

See `LICENSE`.
