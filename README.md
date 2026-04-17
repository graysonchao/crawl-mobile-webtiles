# crawl-mobile-webtiles

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/graysonchao/crawl-mobile-webtiles)

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

### Hosted on Render (phone-friendly)

Tap the **Deploy to Render** button above. Render will:

1. Ask you to sign in with GitHub and authorize access to this repo.
2. Read `render.yaml`, create a free web service, and start deploying.
3. When the deploy finishes you'll get a `https://<name>.onrender.com` URL —
   open that on your phone and log in with your WebTiles account.

Free tier gotcha: the service sleeps after ~15 minutes of inactivity, so the
first request after a break takes ~30-60 s while it wakes up. Upgrade to the
$7/mo Starter plan if you want it always-on. You can change `DCSS_UPSTREAM`
in Render's dashboard under the service's *Environment* tab if you prefer a
different public server (list below).

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
