// Generate sample PDF reports in Node (no browser), using the exact same code as the site.
// Usage: node tests/make_sample_pdfs.js [outDir]      (default: test-results/samples)
// Render to PNG for visual review: uv run python scripts/render_pdf.py test-results/samples/*.pdf
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DOCS = path.resolve(__dirname, '..', 'docs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'test-results', 'samples'));

// Load the browser scripts into this context as if they were <script> tags.
globalThis.window = globalThis;
globalThis.self = globalThis;
for (const f of [
  'vendor/jspdf/jspdf.umd.min.js',
  'vendor/jspdf/jspdf.plugin.autotable.min.js',
  'js/config.js', 'js/model.js', 'js/logo.js', 'js/pdf.js'
]) {
  vm.runInThisContext(fs.readFileSync(path.join(DOCS, f), 'utf8'), { filename: f });
}

const cfg = globalThis.OFFBOARDING_CONFIG;
const M = globalThis.Offboarding.model;
const PDF = globalThis.Offboarding.pdf;

function fonts() {
  const read = (rel) => {
    const p = path.join(DOCS, rel);
    return fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : null;
  };
  const f = { normal: read(cfg.pdfFonts.normal), bold: read(cfg.pdfFonts.bold), italic: read(cfg.pdfFonts.italic) };
  return f.normal && f.bold ? f : null;
}

function complete() {
  const s = M.newState();
  Object.assign(s.general, {
    name: 'Jane Doe', uNumber: 'u0123456', vscAccount: 'vsc12345', supervisor: 'Prof. Jeroen Raes',
    lastDay: '2026-11-30', oneDriveConfirmed: true, gitlabConfirmed: true
  });
  const p = s.projects[0];
  Object.assign(p, {
    name: 'Flemish Gut Flora Project – metagenomics', successor: 'John Smith', sensitive: 'yes',
    keysLocation: 'Encrypted vault on Tier1: /tier1/raeslab/fgfp/keys (separate from data)',
    publishedAny: 'yes', retentionSpecific: 'yes',
    retention: '10 years after project end', deletion: 'Personal data deleted after 5 years',
    depositionsRequired: 'yes', depositions: 'yes'
  });
  p.locations.raw.items = [
    { type: 'tier1', other: '', path: '/tier1/raeslab/fgfp/raw' },
    { type: 'other', other: 'ENA', path: 'https://www.ebi.ac.uk/ena/browser/view/PRJEB00000' }
  ];
  p.locations.processed.items = [{ type: 'tier2-staging', other: '', path: '/staging/leuven/stg_00000/fgfp/processed' }];
  p.locations.code.items = [{ type: 'gitlab', other: '', path: 'https://gitlab.example.org/raeslab/fgfp-pipeline' }];
  p.published.items = [
    { kind: 'dataset', repository: 'ENA', identifier: 'PRJEB00000', licence: '' },
    { kind: 'dataset', repository: 'Zenodo', identifier: '10.5281/zenodo.0000000', licence: 'CC-BY 4.0' },
    { kind: 'code', repository: 'GitHub', identifier: 'https://github.com/raeslab/fgfp-pipeline', licence: 'MIT' }
  ];
  s.code = { readme: 'yes', envs: 'yes', exampleData: 'yes', comments: '' };
  return s;
}

function heavy() {
  const s = complete();
  s.general.name = 'Łukasz Żółć-Ørsted';
  s.general.uNumber = 'x12';
  s.general.oneDriveConfirmed = false;
  for (let i = 0; i < 4; i++) {
    const p = M.newProject();
    p.name = i === 1 ? '' : `Project ${i + 2} with a rather long name to test wrapping behaviour in headers and tables`;
    p.locations.raw.na = i % 2 === 0;
    p.locations.raw.items = [{ type: 'other', other: '', path: '' }];
    p.locations.processed.items = [{ type: 'tier1', other: '', path: '/tier1/raeslab/' + 'very/deep/path/'.repeat(8) + 'file.tsv' }];
    p.locations.code.items = [{ type: '', other: '', path: '' }];
    p.sensitive = i === 2 ? 'yes' : 'no';
    p.depositionsRequired = i === 3 ? 'yes' : i === 0 ? '' : 'no';
    p.depositions = i === 3 ? 'partial' : '';
    p.publishedAny = i === 1 ? 'yes' : 'no';
    p.retentionSpecific = i === 2 ? 'yes' : 'no';
    p.deletion = i === 2 ? 'Delete personal data after 5 years' : '';
    s.projects.push(p);
  }
  s.code = { readme: 'partial', envs: 'no', exampleData: 'na', comments: '' };
  return s;
}

fs.mkdirSync(OUT, { recursive: true });
const now = new Date();
const f = fonts();
const variants = { complete: complete(), empty: M.newState(), heavy: heavy() };
for (const [name, state] of Object.entries(variants)) {
  for (const [fontName, fontData] of [['nunito', f], ['helvetica', null]]) {
    if (fontName === 'nunito' && !fontData) continue;
    const doc = PDF.build({ state, config: cfg, now, jsPDF: globalThis.jspdf.jsPDF, fonts: fontData });
    const file = path.join(OUT, `${name}-${fontName}.pdf`);
    fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
    console.log(`${file}  (${doc.getNumberOfPages()} pages, suggested name: ${PDF.filename(state, now)})`);
  }
}
