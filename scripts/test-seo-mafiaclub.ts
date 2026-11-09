import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:3000';

async function runSeoTests() {
  console.log('🚀 Running SEO Verification Tests for https://mafiaclub.org ...\n');

  // 1. Test /sitemap.xml HTTP response & XML structure
  console.log('--- Test 1: GET /sitemap.xml returns valid XML (not HTML SPA) ---');
  const sitemapRes = await fetch(`${BASE_URL}/sitemap.xml`, {
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
  });
  const sitemapContentType = sitemapRes.headers.get('content-type') || '';
  const sitemapBody = await sitemapRes.text();

  if (sitemapRes.status !== 200) {
    throw new Error(`FAIL Test 1: Expected status 200 for /sitemap.xml, got ${sitemapRes.status}`);
  }
  if (!sitemapContentType.includes('application/xml') && !sitemapContentType.includes('text/xml')) {
    throw new Error(`FAIL Test 1: Expected XML Content-Type for /sitemap.xml, got "${sitemapContentType}"`);
  }
  if (
    !sitemapBody.trim().startsWith('<?xml') ||
    !sitemapBody.includes('<urlset') ||
    !sitemapBody.includes('<loc>https://mafiaclub.org/</loc>') ||
    sitemapBody.toLowerCase().includes('<!doctype html') ||
    sitemapBody.includes('<div id="root">')
  ) {
    throw new Error(`FAIL Test 1: Invalid /sitemap.xml body:\n${sitemapBody}`);
  }
  console.log(`✓ PASS: /sitemap.xml returned HTTP 200 (${sitemapContentType}) with <loc>https://mafiaclub.org/</loc>`);

  // 2. Test /robots.txt HTTP response & directives
  console.log('\n--- Test 2: GET /robots.txt allows root, blocks private/admin paths, and links sitemap ---');
  const robotsRes = await fetch(`${BASE_URL}/robots.txt`);
  const robotsContentType = robotsRes.headers.get('content-type') || '';
  const robotsBody = await robotsRes.text();

  if (robotsRes.status !== 200) {
    throw new Error(`FAIL Test 2: Expected status 200 for /robots.txt, got ${robotsRes.status}`);
  }
  if (!robotsContentType.includes('text/plain')) {
    throw new Error(`FAIL Test 2: Expected text/plain Content-Type for /robots.txt, got "${robotsContentType}"`);
  }
  if (
    !robotsBody.includes('User-agent: *') ||
    !robotsBody.includes('Allow: /') ||
    !robotsBody.includes('Disallow: /api/') ||
    !robotsBody.includes('Disallow: /admin') ||
    !robotsBody.includes('Sitemap: https://mafiaclub.org/sitemap.xml')
  ) {
    throw new Error(`FAIL Test 2: Unexpected /robots.txt content:\n${robotsBody}`);
  }
  console.log(`✓ PASS: /robots.txt returned HTTP 200 (${robotsContentType}) with Sitemap and Disallow rules`);

  // 3. Test Home Page HTML SEO tags (title, description, canonical, OpenGraph, JSON-LD)
  console.log('\n--- Test 3: GET / HTML contains title, meta description, and canonical https://mafiaclub.org/ ---');
  const homeRes = await fetch(`${BASE_URL}/`);
  const homeHtml = await homeRes.text();

  if (homeRes.status !== 200) {
    throw new Error(`FAIL Test 3: Expected status 200 for /, got ${homeRes.status}`);
  }
  if (!homeHtml.includes('<title>Mafia Club — Онлайн-игра «Мафия»: Город Засыпает</title>')) {
    throw new Error('FAIL Test 3: Expected <title> missing in HTML');
  }
  if (!homeHtml.includes('Mafia Club — многопользовательская онлайн-игра «Мафия» в браузере.')) {
    throw new Error('FAIL Test 3: Expected <meta name="description"> missing in HTML');
  }
  if (!homeHtml.includes('<link rel="canonical" href="https://mafiaclub.org/" />')) {
    throw new Error('FAIL Test 3: Expected <link rel="canonical" href="https://mafiaclub.org/" /> missing in HTML');
  }
  if (!homeHtml.includes('<meta property="og:url" content="https://mafiaclub.org/" />')) {
    throw new Error('FAIL Test 3: Expected og:url missing in HTML');
  }
  if (!homeHtml.includes('"@type": "WebApplication"') || !homeHtml.includes('"url": "https://mafiaclub.org/"')) {
    throw new Error('FAIL Test 3: Expected Schema.org JSON-LD missing in HTML');
  }
  console.log('✓ PASS: Home page HTML includes title, description, canonical URL, OpenGraph, and JSON-LD');

  // 4. Test Service Worker & Workbox Denylist configuration
  console.log('\n--- Test 4: Service Worker & Workbox navigateFallbackDenylist exclude /sitemap.xml and /robots.txt ---');
  const swCode = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf-8');
  const viteCode = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf-8');

  if (!swCode.includes("url.pathname === '/sitemap.xml'") || !swCode.includes("url.pathname === '/robots.txt'")) {
    throw new Error('FAIL Test 4: public/sw.js does not bypass /sitemap.xml and /robots.txt');
  }
  if (!viteCode.includes('/^\\/sitemap\\.xml$/') || !viteCode.includes('/^\\/robots\\.txt$/')) {
    throw new Error('FAIL Test 4: vite.config.ts navigateFallbackDenylist does not include /sitemap.xml and /robots.txt');
  }
  console.log('✓ PASS: Service Worker and Workbox denylist bypass /sitemap.xml and /robots.txt');

  // 5. Verify private admin routes remain protected (401 Unauthorized)
  console.log('\n--- Test 5: Admin and private API routes remain closed to unauthenticated crawlers ---');
  const adminVisitorsRes = await fetch(`${BASE_URL}/api/admin/visitors`);
  const adminStatsRes = await fetch(`${BASE_URL}/api/admin/stats`);
  if (adminVisitorsRes.status !== 401 || adminStatsRes.status !== 401) {
    throw new Error(`FAIL Test 5: Admin routes not protected (${adminVisitorsRes.status}, ${adminStatsRes.status})`);
  }
  console.log('✓ PASS: Private admin routes return 401 Unauthorized');

  console.log('\n🎉 ALL 5 SEO VERIFICATION TESTS PASSED 100%!');
}

runSeoTests().catch((err) => {
  console.error('\n❌ SEO TEST SUITE FAILED:', err);
  process.exit(1);
});
