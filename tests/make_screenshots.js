// Screenshots for the README, filled with fictional demo data.
// Usage: node tests/make_screenshots.js [outDir]      (default: docs/img)
// Starts tests/serve.js itself. The PDF report is saved as <outDir>/report.pdf; render it with
//   uv run python scripts/render_pdf.py docs/img/report.pdf
const { chromium, devices } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'img'));
const PORT = 4174;
const URL = `http://localhost:${PORT}/`;
const KEY = 'raeslab-offboarding-v1';

const loc = (type, p, other = '') => ({ type, other, path: p });

// Mostly complete, with a few open items left so the sidebar and export warning have something to show.
const state = {
  v: 1,
  general: {
    name: 'Jane Doe', uNumber: 'u0123456', vscAccount: 'vsc12345', vscNone: false,
    supervisor: 'Prof. Jeroen Raes', lastDay: '2026-11-30', oneDriveConfirmed: true, gitlabConfirmed: true
  },
  projects: [
    {
      id: 'pdemo1', name: 'Flemish Gut Flora Project – metagenomics', successor: 'John Smith',
      locations: {
        raw: { na: false, items: [loc('tier1', '/tier1/raeslab/fgfp/raw'), loc('other', 'https://www.ebi.ac.uk/ena/browser/view/PRJEB00000', 'ENA')] },
        processed: { na: false, items: [loc('tier2-staging', '/staging/leuven/stg_00000/fgfp/processed')] },
        code: { na: false, items: [loc('gitlab', 'https://gitlab.example.org/raeslab/fgfp-pipeline')] }
      },
      sensitive: 'yes', keysLocation: 'Encrypted vault on Tier1: /tier1/raeslab/fgfp/keys (separate from data)',
      publishedAny: 'yes',
      published: {
        items: [
          { kind: 'dataset', repository: 'ENA', identifier: 'PRJEB00000', licence: '' },
          { kind: 'code', repository: 'GitHub', identifier: 'https://github.com/raeslab/fgfp-pipeline', licence: 'MIT' }
        ]
      },
      retentionSpecific: 'no', retention: '', deletion: '',
      depositionsRequired: 'yes', depositions: 'yes', depositionsComment: ''
    },
    {
      id: 'pdemo2', name: 'Mouse microbiome time series', successor: '',
      locations: {
        raw: { na: false, items: [loc('tier1', '/tier1/raeslab/mouse-ts/raw')] },
        processed: { na: true, items: [loc('', '')] },
        code: { na: false, items: [loc('gitlab', '')] }
      },
      sensitive: 'no', keysLocation: '', publishedAny: 'no', published: { items: [] },
      retentionSpecific: 'no', retention: '', deletion: '',
      depositionsRequired: '', depositions: '', depositionsComment: ''
    }
  ],
  code: { readme: 'yes', envs: 'partial', exampleData: 'yes', comments: '' },
  createdAt: '2026-10-20T09:00:00.000Z',
  updatedAt: null
};

async function open(browser, contextOptions) {
  const context = await browser.newContext({ locale: 'en-GB', reducedMotion: 'reduce', acceptDownloads: true, ...contextOptions });
  await context.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', '1');
    }
  }, [KEY, JSON.stringify(state)]);
  const page = await context.newPage();
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  const browser = await chromium.launch();
  try {
    // Desktop: top of the page, the first project, the export dialog and the PDF itself.
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5 });
    await page.screenshot({ path: `${OUT}/overview.png` });
    await page.locator('#project-pdemo1').screenshot({ path: `${OUT}/project.png` });
    await page.getByRole('button', { name: 'Download PDF report' }).click();
    await page.locator('#export-dialog').waitFor();
    await page.screenshot({ path: `${OUT}/export-dialog.png` });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export-dialog').getByRole('button', { name: /download/i }).first().click()
    ]);
    await download.saveAs(`${OUT}/report.pdf`);
    await context.close();

    // Mobile: the hero fills the first screen, so start at the form.
    const mobile = await open(browser, { ...devices['Pixel 7'] });
    await mobile.page.evaluate(() => document.querySelector('[aria-labelledby="sec-general-title"]').scrollIntoView());
    await mobile.page.screenshot({ path: `${OUT}/mobile.png` });
    await mobile.context.close();
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`Screenshots written to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
