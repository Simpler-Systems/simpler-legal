// dev-only static server for the site (gitignored usage; launch: node _serve-site.mjs)
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = dirname(fileURLToPath(import.meta.url))
const MIME = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.js': 'text/javascript' }
createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  const f = resolve(join(ROOT, p))
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('404') }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' })
  createReadStream(f).pipe(res)
}).listen(1437, '127.0.0.1', () => console.log('site on http://127.0.0.1:1437'))
