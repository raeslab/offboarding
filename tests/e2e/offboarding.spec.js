// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');

const bind = (path) => `[data-bind="${path}"]`;

async function fillGeneral(page) {
  await page.locator(bind('general.name')).fill('Jane Doe');
  await page.locator(bind('general.uNumber')).fill('u0123456');
  await page.locator(bind('general.vscAccount')).fill('vsc12345');
  await page.locator(bind('general.supervisor')).fill('Prof. Supervisor');
  await page.locator(bind('general.lastDay')).fill('2026-11-30');
  await page.locator(bind('general.oneDriveConfirmed')).check();
  await page.locator(bind('general.gitlabConfirmed')).check();
}

async function fillProject(page, i, name) {
  const p = `projects.${i}`;
  await page.locator(bind(`${p}.name`)).fill(name);
  await page.locator(bind(`${p}.successor`)).fill('John Smith');
  await page.locator(bind(`${p}.locations.raw.items.0.type`)).selectOption('tier1');
  await page.locator(bind(`${p}.locations.raw.items.0.path`)).fill('/tier1/raeslab/project/raw');
  await page.locator(bind(`${p}.locations.processed.items.0.type`)).selectOption('tier2-staging');
  await page.locator(bind(`${p}.locations.processed.items.0.path`)).fill('/staging/leuven/stg_00000/project/processed');
  await page.locator(bind(`${p}.locations.code.items.0.type`)).selectOption('gitlab');
  await page.locator(bind(`${p}.locations.code.items.0.path`)).fill('https://gitlab.example.org/raeslab/project');
  for (const gate of ['sensitive', 'publishedAny', 'retentionSpecific', 'depositionsRequired']) {
    await page.locator(`${bind(`${p}.${gate}`)}[value="no"]`).check();
  }
}

async function fillCode(page) {
  for (const id of ['readme', 'envs', 'exampleData']) {
    await page.locator(`${bind(`code.${id}`)}[value="yes"]`).check();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('page loads with all sections and no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Code checklist' })).toBeVisible();
  await expect(page.locator('#open-items li')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test('answers persist in localStorage across reloads', async ({ page }) => {
  await fillGeneral(page);
  await page.locator(bind('projects.0.name')).fill('Gut flora');
  await page.waitForTimeout(500); // debounce
  await page.reload();
  await expect(page.locator(bind('general.name'))).toHaveValue('Jane Doe');
  await expect(page.locator(bind('general.lastDay'))).toHaveValue('2026-11-30');
  await expect(page.locator(bind('general.oneDriveConfirmed'))).toBeChecked();
  await expect(page.locator(bind('projects.0.name'))).toHaveValue('Gut flora');
  await expect(page.locator('#save-status')).toContainText('Saved in this browser');
});

test('VSC "no account" disables the field', async ({ page }) => {
  await page.locator(bind('general.vscNone')).check();
  await expect(page.locator(bind('general.vscAccount'))).toBeDisabled();
});

test('format warnings for u-number', async ({ page }) => {
  await page.locator(bind('general.uNumber')).fill('x123');
  await page.locator(bind('general.name')).focus();
  await expect(page.locator('[data-field="general.uNumber"] .warn')).toContainText('looks unusual');
});

test('projects and locations can be added and removed', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add another project' }).click();
  await expect(page.locator('article.project')).toHaveCount(2);

  // multiple locations + "Other" needs a specification
  await page.locator('[data-action="add-location"][data-p="0"][data-cat="raw"]').click();
  await page.locator(bind('projects.0.locations.raw.items.1.type')).selectOption('other');
  await expect(page.locator(bind('projects.0.locations.raw.items.1.other'))).toBeVisible();

  // N/A hides the rows
  await page.locator(bind('projects.0.locations.code.na')).check();
  await expect(page.locator(bind('projects.0.locations.code.items.0.type'))).toHaveCount(0);

  // remove the second project via the confirmation dialog
  await page.locator('[data-action="remove-project"][data-p="1"]').click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('article.project')).toHaveCount(1);
  // the last remaining project cannot be removed
  await expect(page.locator('[data-action="remove-project"]')).toHaveCount(0);
});

test('starts with one project whose title follows the typed name', async ({ page }) => {
  await expect(page.locator('article.project')).toHaveCount(1);
  const title = page.locator('[data-title-for="0"]');
  await expect(title).toHaveText('Untitled project');
  await page.locator(bind('projects.0.name')).pressSequentially('Gut flora');
  await expect(title).toHaveText('Gut flora');
  await page.locator(bind('projects.0.name')).fill('');
  await expect(title).toHaveText('Untitled project');
});

test('quick yes/no questions only reveal details on "Yes"', async ({ page }) => {
  const p = 'projects.0';
  const details = {
    sensitive: `${p}.keysLocation`,
    publishedAny: `${p}.published.items.0.identifier`,
    retentionSpecific: `${p}.retention`,
    depositionsRequired: `${p}.depositions`
  };
  for (const [gate, detail] of Object.entries(details)) {
    await expect(page.locator(bind(detail))).toHaveCount(0);
    await page.locator(`${bind(`${p}.${gate}`)}[value="yes"]`).check();
    await expect(page.locator(bind(detail)).first()).toBeVisible();
    await page.locator(`${bind(`${p}.${gate}`)}[value="no"]`).check();
    await expect(page.locator(bind(detail))).toHaveCount(0);
  }
  // incomplete depositions ask for a comment
  await page.locator(`${bind(`${p}.depositionsRequired`)}[value="yes"]`).check();
  await page.locator(`${bind(`${p}.depositions`)}[value="partial"]`).check();
  await expect(page.locator(bind(`${p}.depositionsComment`))).toBeVisible();
});

test('complete questionnaire exports a timestamped PDF without open items', async ({ page }) => {
  await fillGeneral(page);
  await fillProject(page, 0, 'Flemish Gut Flora Project');
  await fillCode(page);
  await expect(page.locator('.open-items__done')).toBeVisible();
  await expect(page.locator('#progress-label')).toHaveText('100% complete');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PDF report' }).click()
  ]);
  const today = await page.evaluate(() => window.Offboarding.pdf.isoDate(new Date()));
  expect(download.suggestedFilename()).toBe(`Offboarding_Jane-Doe_u0123456_${today}.pdf`);
  const buf = fs.readFileSync(await download.path());
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(5000);
});

test('incomplete questionnaire warns but still allows export', async ({ page }) => {
  await page.locator(bind('general.name')).fill('Jane Doe');
  await page.getByRole('button', { name: 'Download PDF report' }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download anyway' }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^Offboarding_Jane-Doe_\d{4}-\d{2}-\d{2}\.pdf$/);
  // inline warnings are now shown everywhere
  await expect(page.locator('.field.has-warning').first()).toBeVisible();
});

test('clear all answers resets the form', async ({ page }) => {
  await fillGeneral(page);
  await page.getByRole('button', { name: 'Clear all answers' }).click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator(bind('general.name'))).toHaveValue('');
  expect(await page.evaluate((k) => localStorage.getItem(k), 'raeslab-offboarding-v1')).toBeNull();
});

test('tooltips open on tap without toggling the checkbox and stay inside the viewport', async ({ page }) => {
  const field = page.locator('[data-field="general.oneDriveConfirmed"]');
  await field.locator('.tip').click();
  await expect(field.locator('.tip-text')).toBeVisible();
  await expect(page.locator(bind('general.oneDriveConfirmed'))).not.toBeChecked();
  const vw = page.viewportSize().width;
  for (const tip of await page.locator('.tip').all()) {
    await tip.scrollIntoViewIfNeeded();
    await tip.click();
    const box = await tip.locator('+ .tip-text').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.tip-wrap.is-open')).toHaveCount(0);
});

test('keyboard only: radio pills, focus after re-render and dialogs', async ({ page }) => {
  const yes = page.locator(`${bind('projects.0.sensitive')}[value="yes"]`);
  await yes.focus();
  await page.keyboard.press('Space');
  // the form re-renders, but focus stays on the same radio and the details appear
  await expect(page.locator(bind('projects.0.keysLocation'))).toBeVisible();
  await expect(yes).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`${bind('projects.0.sensitive')}[value="no"]`)).toBeFocused();
  await expect(page.locator(bind('projects.0.keysLocation'))).toHaveCount(0);

  // the export dialog can be closed with Escape and nothing is downloaded
  await page.getByRole('button', { name: 'Download PDF report' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#export-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#export-dialog')).toBeHidden();
});

test('no horizontal scrolling', async ({ page }) => {
  await page.locator(`${bind('projects.0.publishedAny')}[value="yes"]`).check();
  await page.locator(bind('projects.0.locations.raw.items.0.type')).selectOption('other');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

// Full-page screenshots for visual review (not compared to a baseline).
test('screenshots for visual review', async ({ page }, testInfo) => {
  const dir = 'test-results/screenshots';
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/${testInfo.project.name}-empty.png`, fullPage: true });
  await fillGeneral(page);
  await page.locator(bind('general.uNumber')).fill('x12');
  await page.locator(bind('projects.0.locations.raw.items.0.type')).selectOption('other');
  await page.locator(`${bind('projects.0.publishedAny')}[value="yes"]`).check();
  await page.locator(`${bind('projects.0.depositionsRequired')}[value="yes"]`).check();
  await page.locator(`${bind('projects.0.depositions')}[value="partial"]`).check();
  await page.locator(`${bind('code.readme')}[value="partial"]`).check();
  await page.getByRole('button', { name: 'Download PDF report' }).click();
  await page.screenshot({ path: `${dir}/${testInfo.project.name}-export-dialog.png` });
  await page.getByRole('button', { name: 'Review open items' }).click();
  await page.waitForTimeout(600); // smooth scroll + flash
  await page.screenshot({ path: `${dir}/${testInfo.project.name}-open-items.png`, fullPage: true });
});

test('published outputs can be in several places (e.g. data on ENA, code on GitHub)', async ({ page }) => {
  const b = 'projects.0.published.items';
  await page.locator(`${bind('projects.0.publishedAny')}[value="yes"]`).check();
  await page.locator(bind(`${b}.0.kind`)).selectOption('dataset');
  await page.locator(bind(`${b}.0.repository`)).fill('ENA');
  await page.locator(bind(`${b}.0.identifier`)).fill('PRJEB00000');
  await page.getByRole('button', { name: '+ Add another place' }).click();
  await expect(page.locator(bind(`${b}.1.kind`))).toBeFocused();
  await page.locator(bind(`${b}.1.kind`)).selectOption('code');
  await page.locator(bind(`${b}.1.repository`)).fill('GitHub');
  await page.locator(bind(`${b}.1.identifier`)).fill('https://github.com/raeslab/example');
  await page.locator(bind(`${b}.1.licence`)).fill('MIT');
  await page.waitForTimeout(500); // debounce
  await page.reload();
  await expect(page.locator(bind(`${b}.1.repository`))).toHaveValue('GitHub');
  const pubs = await page.evaluate(() => window.Offboarding.app.getState().projects[0].published.items);
  expect(pubs.map((p) => [p.kind, p.repository])).toEqual([['dataset', 'ENA'], ['code', 'GitHub']]);
  // neither row is flagged as an open item
  await expect(page.locator('#open-items')).not.toContainText('Published');
});
