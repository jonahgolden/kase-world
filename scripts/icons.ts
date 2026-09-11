// Renders the home-screen icons (public/icons) from scripts/icon.html with Playwright: node scripts/icons.ts scripts/icon.html
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
await page.setContent(readFileSync(process.argv[2], 'utf8'))
await page.waitForTimeout(500)
for (const size of [512, 192, 180]) {
  await page.setViewportSize({ width: size, height: size })
  await page.evaluate((s) => { const el = document.getElementById('i')!; el.style.width = el.style.height = s + 'px'; el.style.borderRadius = Math.round(s * 0.22) + 'px'; el.style.fontSize = Math.round(s * 0.64) + 'px' }, size)
  await page.waitForTimeout(100)
  await page.screenshot({ path: `public/icons/icon-${size}.png`, omitBackground: true })
}
await browser.close()
console.log('icons ok')
