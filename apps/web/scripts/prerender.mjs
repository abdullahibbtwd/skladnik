/**
 * Post-build prerender for public landing HTML (keeps the Vite SPA intact).
 *
 * Why not vite-react-ssg / React Router framework SSG?
 * - vite-react-ssg targets react-router-dom v6; RR v7 maintainers recommend
 *   framework-mode prerender instead.
 * - Framework-mode prerender would replace BrowserRouter with a full
 *   @react-router/dev migration — too invasive for landing-only SEO.
 * This script: vite build → static server → Puppeteer → write HTML into dist.
 */
import { createServer } from 'node:http';
import { accessSync, constants as fsConstants } from 'node:fs';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from 'serve-handler';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');
const ROUTES = (process.env.PRERENDER_ROUTES ?? '/,/bg').split(',').map((r) => r.trim()).filter(Boolean);

const SYSTEM_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

function existsExecutable(path) {
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Prefer env/Docker path, then Puppeteer's downloaded Chrome, then system browsers. */
function resolveChromePath() {
  for (const candidate of SYSTEM_CHROME_CANDIDATES) {
    if (existsExecutable(candidate)) return candidate;
  }
  try {
    const bundled = puppeteer.executablePath();
    if (bundled && existsExecutable(bundled)) return bundled;
  } catch {
    // Puppeteer cache may be empty on fresh installs.
  }
  return undefined;
}

async function assertDist() {
  try {
    await access(join(distDir, 'index.html'));
  } catch {
    throw new Error(`Missing ${join(distDir, 'index.html')} — run vite build first`);
  }
}

function startServer() {
  return new Promise((resolveServer, reject) => {
    const server = createServer((req, res) =>
      handler(req, res, {
        public: distDir,
        rewrites: [{ source: '**', destination: '/index.html' }],
      }),
    );
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({ server, port });
    });
  });
}

function outPathForRoute(route) {
  if (route === '/') return join(distDir, 'index.html');
  const clean = route.replace(/^\//, '').replace(/\/$/, '');
  return join(distDir, clean, 'index.html');
}

async function main() {
  await assertDist();
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const executablePath = resolveChromePath();

  console.log(`[prerender] serving ${distDir} on ${base}`);
  console.log(`[prerender] routes: ${ROUTES.join(', ')}`);
  console.log(`[prerender] chrome: ${executablePath ?? '(puppeteer default)'}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not launch Chrome for prerender (${detail}). ` +
        `Install Chrome, set PUPPETEER_EXECUTABLE_PATH, or run: npx puppeteer browsers install chrome`,
    );
  }

  try {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        try {
          localStorage.clear();
        } catch {
          // ignore
        }
      });
      // Default landing language EN unless the path is /bg (item 2).
      if (route === '/bg' || route.startsWith('/bg/')) {
        await page.evaluateOnNewDocument(() => {
          try {
            localStorage.setItem('skladnik.lang', 'bg');
          } catch {
            // ignore
          }
        });
      } else {
        await page.evaluateOnNewDocument(() => {
          try {
            localStorage.setItem('skladnik.lang', 'en');
          } catch {
            // ignore
          }
        });
      }

      const url = `${base}${route === '/' ? '/' : route}`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });
      await page.waitForSelector('[data-prerender-ready="1"]', { timeout: 30_000 });
      // Let i18n + meta sync settle.
      await new Promise((r) => setTimeout(r, 300));

      const html = await page.content();
      const dest = outPathForRoute(route);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, html, 'utf8');
      console.log(`[prerender] wrote ${dest} (${html.length} bytes)`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error('[prerender] failed:', err);
  process.exit(1);
});
