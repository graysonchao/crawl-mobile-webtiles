'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');
const httpProxy = require('http-proxy');

const UPSTREAM = process.env.DCSS_UPSTREAM || 'https://crawl.project357.org';
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const upstreamUrl = new URL(UPSTREAM);
const upstreamIsSecure = upstreamUrl.protocol === 'https:';

const PUBLIC_DIR = path.join(__dirname, 'public');

function readAsset(name) {
  return fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8');
}

function decompress(body, encoding) {
  if (!encoding) return body;
  try {
    if (encoding === 'gzip') return zlib.gunzipSync(body);
    if (encoding === 'deflate') return zlib.inflateSync(body);
    if (encoding === 'br') return zlib.brotliDecompressSync(body);
  } catch (e) {
    console.warn('Failed to decompress', encoding, e.message);
  }
  return body;
}

const proxy = httpProxy.createProxyServer({
  target: UPSTREAM,
  changeOrigin: true,
  secure: false,
  ws: true,
  selfHandleResponse: true,
  followRedirects: false,
  xfwd: true,
});

proxy.on('proxyReq', (proxyReq, req) => {
  // Strip accept-encoding we can't decode cleanly; force identity for HTML
  const accept = (req.headers['accept'] || '').toLowerCase();
  if (accept.includes('text/html')) {
    proxyReq.setHeader('accept-encoding', 'identity');
  }
});

proxy.on('proxyRes', (proxyRes, req, res) => {
  const chunks = [];
  proxyRes.on('data', (c) => chunks.push(c));
  proxyRes.on('end', () => {
    let body = Buffer.concat(chunks);
    const headers = { ...proxyRes.headers };

    // Strip headers that would block or complicate the injected client
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    delete headers['x-frame-options'];
    delete headers['strict-transport-security'];
    delete headers['content-length'];

    // Rewrite Set-Cookie so the browser keeps them on our origin
    if (headers['set-cookie']) {
      const cookies = Array.isArray(headers['set-cookie'])
        ? headers['set-cookie']
        : [headers['set-cookie']];
      headers['set-cookie'] = cookies.map((c) =>
        c
          .replace(/;\s*Domain=[^;]+/i, '')
          .replace(/;\s*Secure/i, '')
          .replace(/;\s*SameSite=[^;]+/i, '; SameSite=Lax')
      );
    }

    const contentType = String(headers['content-type'] || '');
    const isHtml = contentType.includes('text/html');

    if (isHtml) {
      body = decompress(body, headers['content-encoding']);
      delete headers['content-encoding'];

      let html = body.toString('utf8');
      const headInject =
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
        '<meta name="mobile-web-app-capable" content="yes">' +
        '<meta name="apple-mobile-web-app-capable" content="yes">' +
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
        '<meta name="theme-color" content="#000000">' +
        '<link rel="stylesheet" href="/__mobile__/mobile.css">';
      const bodyInject = '<script src="/__mobile__/mobile.js" defer></script>';

      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, headInject + '</head>');
      } else {
        html = headInject + html;
      }
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, bodyInject + '</body>');
      } else {
        html = html + bodyInject;
      }

      body = Buffer.from(html, 'utf8');
    }

    res.writeHead(proxyRes.statusCode || 200, proxyRes.statusMessage, headers);
    res.end(body);
  });
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Upstream proxy error: ' + err.message);
  }
});

// Serve our own mobile assets under /__mobile__/
function serveAsset(req, res) {
  const file = req.url.replace(/^\/__mobile__\//, '').split('?')[0];
  const safe = path.normalize(file).replace(/^(\.\.[\\/])+/, '');
  const full = path.join(PUBLIC_DIR, safe);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(full).toLowerCase();
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
  };
  res.writeHead(200, {
    'content-type': types[ext] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/__mobile__/')) {
    return serveAsset(req, res);
  }
  proxy.web(req, res);
});

server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});

server.listen(PORT, HOST, () => {
  console.log(`mobile-webtiles proxy listening on http://${HOST}:${PORT}`);
  console.log(`upstream: ${UPSTREAM} (${upstreamIsSecure ? 'secure' : 'insecure'})`);
});
