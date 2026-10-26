/*
 * Questionnaire UI: rendering, binding, autosave (localStorage), export.
 */
(function () {
  'use strict';

  var cfg = window.OFFBOARDING_CONFIG;
  var M = window.Offboarding.model;
  var PDF = window.Offboarding.pdf;

  var form = document.getElementById('form-root');
  var state;
  var touched = new Set();
  var showAll = false;
  var storageOk = true;
  var saveTimer = null;
  var lastSaved = null;
  var fontCache = null;

  /* ------------------------------------------------------------------ utils */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getPath(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, state);
  }

  function setPath(path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) { return o[k]; }, state);
    target[last] = value;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' toast--error' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3500);
  }

  var ICON_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"/></svg>';

  /* ---------------------------------------------------------------- storage */

  function load() {
    try {
      var raw = window.localStorage.getItem(cfg.storageKey);
      if (raw) {
        var s = M.normalize(JSON.parse(raw));
        lastSaved = s.updatedAt ? new Date(s.updatedAt) : null;
        return s;
      }
    } catch (e) {
      storageOk = false;
    }
    return M.newState();
  }

  function saveNow() {
    clearTimeout(saveTimer);
    state.updatedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(cfg.storageKey, JSON.stringify(state));
      storageOk = true;
      lastSaved = new Date();
    } catch (e) {
      storageOk = false;
    }
    renderSaveStatus();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }

  function renderSaveStatus() {
    var el = document.getElementById('save-status');
    if (!storageOk) {
      el.textContent = 'Your browser blocks local storage: answers will be lost when you close this page.';
      return;
    }
    if (!lastSaved) { el.textContent = 'Answers are saved automatically in this browser.'; return; }
    var today = new Date();
    var sameDay = lastSaved.toDateString() === today.toDateString();
    el.textContent = 'Saved in this browser ' + (sameDay ? 'at ' : 'on ' + PDF.isoDate(lastSaved) + ' ') +
      pad(lastSaved.getHours()) + ':' + pad(lastSaved.getMinutes());
  }

  /* ---------------------------------------------------------- field helpers */

  var tipCounter = 0;
  function tip(text) {
    if (!text) return '';
    var id = 'tip-' + (++tipCounter);
    return '<span class="tip-wrap"><button type="button" class="tip" aria-label="More information" aria-describedby="' + id + '">i</button>' +
      '<span role="tooltip" id="' + id + '" class="tip-text">' + esc(text) + '</span></span>';
  }

  function inputId(path) { return 'in-' + path.replace(/\./g, '-'); }

  function fieldWrap(path, inner, extraClass) {
    return '<div class="field' + (extraClass ? ' ' + extraClass : '') + '" data-field="' + esc(path) + '">' + inner +
      '<p class="warn" aria-live="polite"></p></div>';
  }

  function textField(o) {
    var id = inputId(o.path);
    var value = getPath(o.path);
    var tag = o.type === 'textarea'
      ? '<textarea id="' + id + '" data-bind="' + o.path + '" placeholder="' + esc(o.placeholder || '') + '"' + (o.disabled ? ' disabled' : '') + '>' + esc(value) + '</textarea>'
      : '<input id="' + id + '" type="' + (o.type || 'text') + '" data-bind="' + o.path + '" value="' + esc(value) + '" placeholder="' + esc(o.placeholder || '') + '"' +
        (o.disabled ? ' disabled' : '') + (o.autocomplete ? ' autocomplete="' + o.autocomplete + '"' : '') + ' spellcheck="false">';
    return fieldWrap(o.path,
      '<label class="field__label" for="' + id + '">' + esc(o.label) +
        (o.optional ? ' <span class="field__opt">(optional)</span>' : '') + tip(o.tip) + '</label>' +
      (o.hint ? '<p class="field__hint">' + esc(o.hint) + '</p>' : '') + tag + (o.after || ''), o.cls);
  }

  function selectField(o) {
    var id = inputId(o.path);
    var value = getPath(o.path);
    var opts = '<option value="">' + esc(o.empty || 'Select…') + '</option>' + o.options.map(function (op) {
      return '<option value="' + esc(op.value) + '"' + (op.value === value ? ' selected' : '') + '>' + esc(op.label) + '</option>';
    }).join('');
    return fieldWrap(o.path,
      '<label class="field__label" for="' + id + '">' + esc(o.label) + '</label>' +
      '<select id="' + id + '" data-bind="' + o.path + '">' + opts + '</select>');
  }

  function radios(path, options, label) {
    var value = getPath(path);
    var html = '<div class="radios" role="radiogroup" aria-label="' + esc(label) + '">' + options.map(function (op) {
      return '<label class="radio radio--' + (op.tone || 'neutral') + '"><input type="radio" name="' + path + '" data-bind="' + path +
        '" value="' + esc(op.value) + '"' + (op.value === value ? ' checked' : '') + '><span>' + esc(op.label) + '</span></label>';
    }).join('') + '</div>';
    return html;
  }

  function checkbox(path, label, cls) {
    var id = inputId(path);
    return '<label class="check ' + (cls || '') + '" for="' + id + '"><input type="checkbox" id="' + id + '" data-bind="' + path + '"' +
      (getPath(path) ? ' checked' : '') + '><span>' + label + '</span></label>';
  }

  function confirmBox(path, title, sub, tipText) {
    var id = inputId(path);
    var checked = !!getPath(path);
    return fieldWrap(path,
      '<label class="confirm' + (checked ? ' is-checked' : '') + '" for="' + id + '">' +
        '<input type="checkbox" id="' + id + '" data-bind="' + path + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="confirm__text"><span class="confirm__title">' + title + ' ' + tip(tipText) + '</span>' +
        '<span class="confirm__sub">' + sub + '</span></span></label>');
  }

  function sectionHead(num, title, intro, id) {
    return '<div class="section__head" id="' + id + '"><span class="section__num">' + num + '</span><h2>' + esc(title) + '</h2></div>' +
      (intro ? '<p class="section__intro">' + intro + '</p>' : '');
  }

  /* -------------------------------------------------------------- sections */

  function renderGeneral() {
    var g = state.general;
    var ns = cfg.gitlab.namespace;
    var nsHtml = cfg.gitlab.namespaceUrl
      ? '<a href="' + esc(cfg.gitlab.namespaceUrl) + '" target="_blank" rel="noopener">' + esc(ns) + '</a>'
      : '<strong>' + esc(ns) + '</strong>';
    return '<section class="section" aria-labelledby="sec-general-title">' +
      sectionHead(1, 'General', 'For everyone who worked with data or code in the lab.', 'sec-general') +
      '<div class="card"><div class="grid grid--2">' +
        textField({ path: 'general.name', label: 'Full name', placeholder: 'First and last name', autocomplete: 'name' }) +
        textField({ path: 'general.uNumber', label: 'u-number', placeholder: cfg.patterns.uNumber.example }) +
        textField({
          path: 'general.vscAccount', label: 'VSC account', placeholder: g.vscNone ? 'Not applicable' : cfg.patterns.vsc.example,
          disabled: g.vscNone, tip: cfg.tooltips.vsc,
          after: checkbox('general.vscNone', 'I don’t have a VSC account', 'check--inline')
        }) +
        textField({ path: 'general.supervisor', label: 'Supervisor', placeholder: 'Name of your supervisor' }) +
        textField({ path: 'general.lastDay', label: 'Last working day', type: 'date' }) +
      '</div></div>' +
      '<div class="card"><h3 class="subhead">Please confirm</h3><div class="grid">' +
        confirmBox('general.oneDriveConfirmed',
          'There is no more research data on my personal OneDrive.',
          'Data has been moved to the location agreed with my supervisor.', cfg.tooltips.oneDrive) +
        confirmBox('general.gitlabConfirmed',
          'There is no more data or code in private GitLab repositories.',
          'All my projects have been moved to the ' + nsHtml + ' namespace.', cfg.tooltips.gitlab) +
      '</div></div></section>';
  }

  function renderLocationRow(pi, cat, li, it, count) {
    var base = 'projects.' + pi + '.locations.' + cat.key + '.items.' + li;
    var type = cfg.locationTypes.filter(function (t) { return t.value === it.type; })[0];
    var isOther = it.type === 'other';
    return '<div class="loc-row' + (isOther ? ' loc-row--other' : '') + '">' +
      selectField({ path: base + '.type', label: 'Location', options: cfg.locationTypes, empty: 'Location…' }) +
      (isOther ? textField({ path: base + '.other', label: 'Specify', placeholder: 'Which storage? e.g. Zenodo, external drive…' }) : '') +
      textField({ path: base + '.path', label: 'Path / URL', placeholder: type ? type.placeholder : 'Path or URL' }) +
      '<button type="button" class="icon-btn" data-action="remove-location" data-p="' + pi + '" data-cat="' + cat.key + '" data-i="' + li +
        '" aria-label="Remove location ' + (li + 1) + ' of ' + esc(cat.label) + '"' + (count === 1 && M.isEmptyLocation(it) ? ' disabled style="visibility:hidden"' : '') + '>' + ICON_TRASH + '</button>' +
    '</div>';
  }

  function renderCategory(p, pi, cat) {
    var loc = p.locations[cat.key];
    var naPath = 'projects.' + pi + '.locations.' + cat.key + '.na';
    var html = '<div class="category' + (loc.na ? ' is-na' : '') + '">' +
      '<div class="category__head"><span class="category__title">' + esc(cat.label) + tip(cat.help) + '</span>' +
      checkbox(naPath, 'Not applicable', 'check--inline') + '</div>';
    if (!loc.na) {
      html += loc.items.map(function (it, li) { return renderLocationRow(pi, cat, li, it, loc.items.length); }).join('');
      html += '<div class="loc-add"><button type="button" class="btn btn--secondary btn--small" data-action="add-location" data-p="' + pi +
        '" data-cat="' + cat.key + '">+ Add location</button></div>';
    }
    return html + '</div>';
  }

  var YES_NO = [{ value: 'yes', label: 'Yes', tone: 'choice' }, { value: 'no', label: 'No', tone: 'choice' }];

  /* A quick yes/no question; `details` (HTML) is only shown when the answer is "yes". */
  function gate(path, question, tipText, details) {
    var open = getPath(path) === 'yes';
    return '<div class="gate' + (open ? ' is-open' : '') + '">' +
      fieldWrap(path,
        '<div class="gate__row"><span class="gate__q">' + esc(question) + ' ' + tip(tipText) + '</span>' +
        radios(path, YES_NO, question) + '</div>', 'gate__field') +
      (open ? '<div class="gate__details">' + details + '</div>' : '') +
    '</div>';
  }

  function renderPublishedRows(p, pi) {
    var base = 'projects.' + pi + '.published';
    var items = p.published.items;
    return '<p class="field__hint">Add one row per place, e.g. raw reads on ENA and code on GitHub.</p>' +
    items.map(function (it, j) {
      var b = base + '.items.' + j;
      var onlyEmpty = items.length === 1 && M.isEmptyPublished(it);
      return '<div class="pub-row">' +
        selectField({ path: b + '.kind', label: 'Type', options: cfg.publishedKinds, empty: 'Type…' }) +
        textField({ path: b + '.repository', label: 'Repository', placeholder: 'ENA, Zenodo, GitHub, …' }) +
        textField({ path: b + '.identifier', label: 'DOI / accession / URL', placeholder: '10.5281/zenodo.… or PRJEB…' }) +
        textField({ path: b + '.licence', label: 'Licence', placeholder: 'CC-BY 4.0, MIT…' }) +
        '<button type="button" class="icon-btn" data-action="remove-published" data-p="' + pi + '" data-i="' + j +
          '" aria-label="Remove published output ' + (j + 1) + '"' + (onlyEmpty ? ' disabled style="visibility:hidden"' : '') + '>' +
          ICON_TRASH + '</button></div>';
    }).join('') +
    '<div class="loc-add"><button type="button" class="btn btn--secondary btn--small" data-action="add-published" data-p="' + pi +
      '">+ Add another place</button></div>';
  }

  function renderProject(p, pi) {
    var base = 'projects.' + pi;
    var showDepComment = p.depositions === 'partial' || p.depositions === 'no';
    var doneOptions = cfg.answerOptions.filter(function (o) { return o.value !== 'na'; });
    return '<article class="card project" id="project-' + esc(p.id) + '" aria-label="Project ' + (pi + 1) + '">' +
      '<div class="project__head"><h3 class="project__title"><small>Project ' + (pi + 1) + '</small>' +
        '<span data-title-for="' + pi + '">' + esc(p.name.trim() || 'Untitled project') + '</span></h3>' +
        (state.projects.length > 1
          ? '<button type="button" class="btn btn--link" data-action="remove-project" data-p="' + pi + '">Remove project</button>'
          : '') + '</div>' +
      '<div class="project__body">' +
        '<div class="grid grid--2">' +
          textField({ path: base + '.name', label: 'Project name', placeholder: 'e.g. Flemish Gut Flora Project – metagenomics' }) +
          textField({ path: base + '.successor', label: 'Who will take over?', optional: true, placeholder: 'Name of colleague, if known', tip: cfg.tooltips.successor }) +
        '</div>' +
        '<div><h3 class="subhead">Where are the data and code stored?</h3>' +
          cfg.categories.map(function (cat) { return renderCategory(p, pi, cat); }).join('') + '</div>' +
        '<div><h3 class="subhead">Quick questions</h3><div class="gates">' +
          gate(base + '.sensitive', cfg.gates.sensitive, cfg.tooltips.sensitive,
            textField({ path: base + '.keysLocation', label: 'Where are the pseudonymisation / linking keys stored?', hint: 'Keys must be stored separately from the data.', placeholder: 'Path or system' })) +
          gate(base + '.publishedAny', cfg.gates.published, cfg.tooltips.published, renderPublishedRows(p, pi)) +
          gate(base + '.retentionSpecific', cfg.gates.retention, cfg.tooltips.retention,
            '<div class="grid grid--2">' +
              textField({ path: base + '.retention', label: 'Retention period', placeholder: 'e.g. 10 years after project end' }) +
              textField({ path: base + '.deletion', label: 'Deletion requirements', optional: true, placeholder: 'e.g. personal data deleted after 5 years' }) +
            '</div>') +
          gate(base + '.depositionsRequired', cfg.gates.depositions, cfg.tooltips.depositions,
            fieldWrap(base + '.depositions',
              '<span class="field__label">Have all of them been completed?</span>' +
              radios(base + '.depositions', doneOptions, 'Depositions completed')) +
            (showDepComment ? textField({ path: base + '.depositionsComment', label: 'Which depositions are still open, and who will do them?', type: 'textarea' }) : '')) +
        '</div></div>' +
      '</div></article>';
  }

  function renderProjects() {
    return '<section class="section" aria-labelledby="sec-projects">' +
      sectionHead(2, 'Projects', 'Add one block for every project you worked on. Tick “Not applicable” for categories that do not apply.', 'sec-projects') +
      state.projects.map(renderProject).join('') +
      fieldWrap('projects', '<button type="button" class="btn btn--ghost add-project" data-action="add-project">+ Add another project</button>') +
      '</section>';
  }

  function renderCode() {
    return '<section class="section" aria-labelledby="sec-code">' +
      sectionHead(3, 'Code checklist', esc(cfg.tooltips.codeChecklist), 'sec-code') +
      '<div class="card">' +
        cfg.codeChecks.map(function (c) {
          var path = 'code.' + c.id;
          return fieldWrap(path,
            '<div><div class="code-item__label">' + esc(c.label) + '</div><p class="code-item__help">' + esc(c.help) + '</p></div>' +
            radios(path, cfg.answerOptions, c.label), 'code-item');
        }).join('') +
        '<div style="margin-top:18px">' +
        textField({
          path: 'code.comments', label: 'Deviations / comments', type: 'textarea',
          hint: 'Required when any answer above is not “Yes”: explain which repositories deviate and why.',
          placeholder: 'e.g. repo X has no example data because the data cannot be shared (GDPR).'
        }) + '</div>' +
      '</div></section>';
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    var active = document.activeElement;
    var focusPath = active && active.dataset ? active.dataset.bind : null;
    var focusVal = active && active.type === 'radio' ? active.value : null;
    var selStart = null;
    try { selStart = active && active.selectionStart; } catch (e) { /* not a text input */ }
    var scrollY = window.scrollY;

    tipCounter = 0;
    form.innerHTML = renderGeneral() + renderProjects() + renderCode();

    if (focusPath) {
      var sel = '[data-bind="' + focusPath + '"]' + (focusVal ? '[value="' + focusVal + '"]' : '');
      var el = form.querySelector(sel);
      if (el) {
        el.focus({ preventScroll: true });
        if (selStart != null && el.setSelectionRange) { try { el.setSelectionRange(selStart, selStart); } catch (e) { /* ignore */ } }
      }
    }
    window.scrollTo(0, scrollY);
    updateStatus();
  }

  function updateStatus() {
    var res = M.validate(state, cfg);
    var pct = res.total ? Math.round((res.done / res.total) * 100) : 0;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress').setAttribute('aria-valuenow', pct);
    document.getElementById('progress-label').textContent = pct + '% complete';

    // inline warnings
    var byField = {};
    res.issues.forEach(function (it) { (byField[it.field] = byField[it.field] || []).push(it.msg); });
    form.querySelectorAll('.field[data-field]').forEach(function (el) {
      var f = el.getAttribute('data-field');
      var msgs = byField[f];
      var show = msgs && (showAll || touched.has(f));
      el.classList.toggle('has-warning', !!show);
      var w = el.querySelector(':scope > .warn');
      if (w) w.textContent = show ? msgs.join(' · ') : '';
    });

    // sidebar
    var box = document.getElementById('open-items');
    if (!res.issues.length) {
      box.innerHTML = '<div class="open-items__done">All items complete. Download the PDF report and send it to ' + esc(cfg.sendTo) + '.</div>';
    } else {
      box.innerHTML = '<h3>Open items (' + res.issues.length + ')</h3><ul>' + res.issues.map(function (it) {
        return '<li><a href="#" data-action="jump" data-field="' + esc(it.field) + '"><small>' + esc(it.section) + '</small>' + esc(it.msg) + '</a></li>';
      }).join('') + '</ul>';
    }
    return res;
  }

  function jumpTo(field) {
    showAll = true;
    updateStatus();
    var el = form.querySelector('.field[data-field="' + field.replace(/"/g, '') + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var input = el.querySelector('input:not([disabled]), select, textarea, button');
    if (input) setTimeout(function () { input.focus({ preventScroll: true }); }, 350);
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  /* --------------------------------------------------------------- dialogs */

  function confirmDialog(text, okLabel) {
    var dlg = document.getElementById('confirm-dialog');
    document.getElementById('confirm-dialog-text').textContent = text;
    document.getElementById('confirm-dialog-ok').textContent = okLabel || 'Delete';
    return new Promise(function (resolve) {
      if (typeof dlg.showModal !== 'function') { resolve(window.confirm(text)); return; }
      dlg.returnValue = '';
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      });
      dlg.showModal();
    });
  }

  /* ---------------------------------------------------------------- export */

  function arrayBufferToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function loadFonts() {
    if (fontCache !== null) return Promise.resolve(fontCache);
    var f = cfg.pdfFonts;
    function get(url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + ': ' + r.status);
        return r.arrayBuffer();
      }).then(arrayBufferToBase64);
    }
    return Promise.all([get(f.normal), get(f.bold), get(f.italic).catch(function () { return null; })])
      .then(function (r) { fontCache = { normal: r[0], bold: r[1], italic: r[2] }; return fontCache; })
      .catch(function () { fontCache = false; return null; }); // e.g. opened via file:// — fall back to Helvetica
  }

  function doExport() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      toast('PDF library not found (docs/vendor/jspdf). See README.', true);
      return Promise.resolve();
    }
    saveNow();
    return loadFonts().then(function (fonts) {
      var now = new Date();
      var doc = PDF.build({ state: state, config: cfg, now: now, jsPDF: window.jspdf.jsPDF, fonts: fonts || null });
      var name = PDF.filename(state, now);
      doc.save(name);
      toast('Downloaded ' + name);
    }).catch(function (e) {
      console.error(e);
      toast('Could not create the PDF: ' + e.message, true);
    });
  }

  function startExport() {
    showAll = true;
    var res = updateStatus();
    if (!res.issues.length) { doExport(); return; }
    var dlg = document.getElementById('export-dialog');
    document.getElementById('export-dialog-text').textContent =
      res.issues.length + ' item' + (res.issues.length === 1 ? ' is' : 's are') +
      ' not complete. You can still download the report: open items will be flagged in the PDF.';
    var list = document.getElementById('export-dialog-list');
    list.innerHTML = res.issues.slice(0, 12).map(function (it) {
      return '<li><strong>' + esc(it.section) + ':</strong> ' + esc(it.msg) + '</li>';
    }).join('') + (res.issues.length > 12 ? '<li>… and ' + (res.issues.length - 12) + ' more</li>' : '');
    if (typeof dlg.showModal !== 'function') { if (window.confirm(dlg.textContent)) doExport(); return; }
    dlg.returnValue = '';
    dlg.addEventListener('close', function onClose() {
      dlg.removeEventListener('close', onClose);
      if (dlg.returnValue === 'export') doExport();
      else if (dlg.returnValue === 'review') jumpTo(res.issues[0].field);
    });
    dlg.showModal();
  }

  /* ---------------------------------------------------------------- events */

  form.addEventListener('submit', function (e) { e.preventDefault(); });

  form.addEventListener('input', function (e) {
    var t = e.target;
    var path = t.dataset && t.dataset.bind;
    if (!path || t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT') return;
    setPath(path, t.value);
    var m = /^projects\.(\d+)\.name$/.exec(path);
    if (m) {
      var title = form.querySelector('[data-title-for="' + m[1] + '"]');
      if (title) title.textContent = t.value.trim() || 'Untitled project';
    }
    scheduleSave();
    updateStatus();
  });

  form.addEventListener('change', function (e) {
    var t = e.target;
    var path = t.dataset && t.dataset.bind;
    if (!path) return;
    if (t.type === 'checkbox') setPath(path, t.checked);
    else if (t.type === 'radio') {
      if (t.checked) setPath(path, t.value);
      // opening "published outputs" immediately shows one empty row to fill in
      var pm = /^projects\.(\d+)\.publishedAny$/.exec(path);
      if (pm && t.value === 'yes') {
        var pubItems = state.projects[+pm[1]].published.items;
        if (!pubItems.length) pubItems.push(M.emptyPublished());
      }
    }
    else if (t.tagName === 'SELECT') setPath(path, t.value);
    else { setPath(path, t.value); touched.add(path); saveNow(); updateStatus(); return; }
    touched.add(path);
    saveNow();
    render();
  });

  form.addEventListener('focusout', function (e) {
    var path = e.target.dataset && e.target.dataset.bind;
    if (path && e.target.type !== 'checkbox' && e.target.type !== 'radio') {
      touched.add(path);
      updateStatus();
    }
  });

  // keep a visible tooltip inside the viewport: shift it sideways, flip it below when there is no room above
  function placeTip(wrap) {
    var t = wrap.querySelector('.tip-text');
    if (!t) return;
    var margin = 8;
    wrap.classList.remove('tip-wrap--below');
    t.style.setProperty('--tip-dx', '0px');
    var r = t.getBoundingClientRect();
    if (!r.width) return;
    var vw = document.documentElement.clientWidth;
    var dx = r.left < margin ? margin - r.left : r.right > vw - margin ? vw - margin - r.right : 0;
    t.style.setProperty('--tip-dx', Math.round(dx) + 'px');
    if (r.top < margin) wrap.classList.add('tip-wrap--below');
  }
  document.addEventListener('mouseover', function (e) {
    var wrap = e.target.closest && e.target.closest('.tip-wrap');
    if (wrap) placeTip(wrap);
  });
  document.addEventListener('focusin', function (e) {
    if (e.target.classList && e.target.classList.contains('tip')) placeTip(e.target.parentNode);
  });

  // tooltips: allow tap-to-toggle on touch devices, Escape to close
  document.addEventListener('click', function (e) {
    var tipBtn = e.target.closest('.tip');
    document.querySelectorAll('.tip-wrap.is-open').forEach(function (w) {
      if (!tipBtn || w !== tipBtn.parentNode) w.classList.remove('is-open');
    });
    if (tipBtn) {
      e.preventDefault(); // don't toggle the surrounding checkbox label
      tipBtn.parentNode.classList.toggle('is-open');
      placeTip(tipBtn.parentNode);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.tip-wrap.is-open').forEach(function (w) { w.classList.remove('is-open'); });
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var a = btn.dataset.action;
    var pi = btn.dataset.p != null ? +btn.dataset.p : null;

    if (a === 'jump') { e.preventDefault(); jumpTo(btn.dataset.field); return; }
    if (a === 'export') { startExport(); return; }

    if (a === 'add-project') {
      state.projects.push(M.newProject());
      saveNow();
      render();
      var idx = state.projects.length - 1;
      var input = form.querySelector('[data-bind="projects.' + idx + '.name"]');
      if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus({ preventScroll: true }); }
      return;
    }
    if (a === 'remove-project') {
      var p = state.projects[pi];
      confirmDialog('Remove “' + (p.name || 'Project ' + (pi + 1)) + '”? All answers for this project will be deleted.', 'Remove project')
        .then(function (ok) {
          if (!ok) return;
          state.projects.splice(pi, 1);
          touched.add('projects');
          saveNow();
          render();
          toast('Project removed');
        });
      return;
    }
    if (a === 'add-location') {
      var items = state.projects[pi].locations[btn.dataset.cat].items;
      items.push(M.emptyLocation());
      saveNow();
      render();
      var sel = form.querySelector('[data-bind="projects.' + pi + '.locations.' + btn.dataset.cat + '.items.' + (items.length - 1) + '.type"]');
      if (sel) sel.focus();
      return;
    }
    if (a === 'remove-location') {
      var list = state.projects[pi].locations[btn.dataset.cat].items;
      list.splice(+btn.dataset.i, 1);
      if (!list.length) list.push(M.emptyLocation());
      saveNow();
      render();
      return;
    }
    if (a === 'add-published') {
      var pubs = state.projects[pi].published.items;
      pubs.push(M.emptyPublished());
      saveNow();
      render();
      var k = form.querySelector('[data-bind="projects.' + pi + '.published.items.' + (pubs.length - 1) + '.kind"]');
      if (k) k.focus();
      return;
    }
    if (a === 'remove-published') {
      var pubList = state.projects[pi].published.items;
      pubList.splice(+btn.dataset.i, 1);
      if (!pubList.length) pubList.push(M.emptyPublished());
      saveNow();
      render();
      return;
    }
    if (a === 'reset') {
      confirmDialog('This deletes all your answers from this browser. Download the PDF first if you want to keep a copy.', 'Clear all answers')
        .then(function (ok) {
          if (!ok) return;
          try { window.localStorage.removeItem(cfg.storageKey); } catch (err) { /* ignore */ }
          state = M.newState();
          touched.clear();
          showAll = false;
          lastSaved = null;
          render();
          renderSaveStatus();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          toast('All answers cleared');
        });
    }
  });

  window.addEventListener('beforeunload', function () { if (saveTimer) saveNow(); });

  /* ------------------------------------------------------------------ init */

  document.querySelectorAll('[data-config]').forEach(function (el) {
    var v = cfg[el.getAttribute('data-config')];
    if (v) el.textContent = v;
  });

  state = load();
  render();
  renderSaveStatus();

  // test hook
  window.Offboarding.app = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    exportPdf: doExport
  };
})();
