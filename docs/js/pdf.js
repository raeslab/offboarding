/*
 * PDF report generation with jsPDF + jspdf-autotable.
 * Pure function of (state, config, now) so it can run in the browser and in Node tests.
 */
(function (root) {
  'use strict';
  var NS = (root.Offboarding = root.Offboarding || {});

  var C = {
    navy: [27, 41, 68],
    teal: [28, 187, 186],
    tealDark: [18, 140, 139],
    tealLight: [230, 247, 247],
    purple: [93, 43, 131],
    orange: [236, 102, 42],
    orangeDark: [181, 70, 26],
    orangeLight: [253, 240, 234],
    red: [192, 57, 43],
    grey50: [245, 247, 250],
    grey200: [221, 227, 234],
    grey400: [154, 165, 181],
    grey600: [91, 102, 118],
    white: [255, 255, 255]
  };
  var ACCENTS = [C.teal, C.purple, C.orange];

  var PAGE_W = 210;
  var PAGE_H = 297;
  var MX = 18; // horizontal margin
  var TOP_CONT = 28; // content top on continuation pages
  var BOTTOM = 22; // reserved for footer

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function formatTimestamp(d) {
    var date;
    var tz = '';
    try {
      date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
      var parts = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(d);
      parts.forEach(function (p) { if (p.type === 'timeZoneName') tz = p.value; });
    } catch (e) {
      date = isoDate(d);
    }
    return date + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + (tz ? ' (' + tz + ')' : '');
  }

  function formatDay(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    try {
      return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    } catch (e) { return iso; }
  }

  /* Standard PDF fonts only support Latin-1; transliterate everything else. */
  var NO_DECOMP = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Œ': 'OE', 'œ': 'oe', 'ı': 'i', 'Ħ': 'H', 'ħ': 'h', 'Ŧ': 'T', 'ŧ': 't' };

  function latin1(s) {
    s = String(s == null ? '' : s)
      .replace(/[ŁłĐđŒœıĦħŦŧ]/g, function (c) { return NO_DECOMP[c]; })
      .replace(/[‘’‚]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/€/g, 'EUR')
      .replace(/ /g, ' ');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch.charCodeAt(0) <= 255) { out += ch; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : '';
      out += base && base.charCodeAt(0) <= 255 ? base : '?';
    }
    return out;
  }

  function filename(state, now) {
    var g = state.general;
    var parts = ['Offboarding'];
    var name = String(g.name || '').trim();
    if (name) parts.push(name);
    if (String(g.uNumber || '').trim()) parts.push(g.uNumber.trim());
    parts.push(isoDate(now));
    var extra = { 'Ø': 'O', 'ø': 'o', 'Æ': 'AE', 'æ': 'ae', 'ß': 'ss', 'Ð': 'D', 'ð': 'd', 'Þ': 'Th', 'þ': 'th' };
    var base = latin1(parts.join('_'))
      .replace(/[ØøÆæßÐðÞþ]/g, function (c) { return extra[c]; })
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^|_)-+|-+(?=_|$)/g, '$1');
    return base + '.pdf';
  }

  function labelOf(list, value) {
    for (var i = 0; i < list.length; i++) if (list[i].value === value) return list[i].label;
    return value;
  }

  /* Resolve the autoTable function regardless of the plugin's packaging. */
  function getAutoTable(doc) {
    if (typeof doc.autoTable === 'function') {
      return function (opts) { return doc.autoTable(opts); };
    }
    var names = ['jspdf_autotable', 'jspdfAutoTable', 'jspdfAutotable', 'jspdf-autotable'];
    for (var i = 0; i < names.length; i++) {
      var g = root[names[i]];
      if (!g) continue;
      if (typeof g.applyPlugin === 'function' && root.jspdf) {
        g.applyPlugin(root.jspdf.jsPDF);
        if (typeof doc.autoTable === 'function') return function (opts) { return doc.autoTable(opts); };
      }
      var fn = typeof g === 'function' ? g : (g.autoTable || g.default);
      if (typeof fn === 'function') return function (opts) { return fn(doc, opts); };
    }
    throw new Error('jspdf-autotable is not loaded');
  }

  function build(opts) {
    var state = opts.state;
    var cfg = opts.config;
    var now = opts.now || new Date();
    var JsPDF = opts.jsPDF;
    var fonts = opts.fonts; // {normal, bold, italic} base64 TTFs, or null
    var validation = opts.validation || NS.model.validate(state, cfg);
    var issues = validation.issues;

    var doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
    var autoTable = getAutoTable(doc);

    var FONT = 'helvetica';
    var T = latin1;
    if (fonts && fonts.normal && fonts.bold) {
      try {
        doc.addFileToVFS('NunitoSans-Regular.ttf', fonts.normal);
        doc.addFont('NunitoSans-Regular.ttf', 'NunitoSans', 'normal');
        doc.addFileToVFS('NunitoSans-Bold.ttf', fonts.bold);
        doc.addFont('NunitoSans-Bold.ttf', 'NunitoSans', 'bold');
        if (fonts.italic) {
          doc.addFileToVFS('NunitoSans-Italic.ttf', fonts.italic);
          doc.addFont('NunitoSans-Italic.ttf', 'NunitoSans', 'italic');
        }
        doc.setFont('NunitoSans', 'normal');
        FONT = 'NunitoSans';
        T = function (s) { return String(s == null ? '' : s).replace(/ /g, ' '); };
      } catch (e) {
        FONT = 'helvetica';
        T = latin1;
      }
    }
    var hasItalic = FONT === 'helvetica' || !!(fonts && fonts.italic);
    var ITALIC = hasItalic ? 'italic' : 'normal';

    var g = state.general;
    var personLine = T((g.name || 'Name not provided') + (g.uNumber ? ' (' + g.uNumber + ')' : ''));
    var stamp = formatTimestamp(now);

    doc.setProperties({
      title: T(cfg.reportTitle + ' - ' + (g.name || '')),
      subject: T(cfg.groupName + ' offboarding'),
      author: T(g.name || ''),
      creator: T(cfg.groupName + ' offboarding website'),
      keywords: 'offboarding, data, code, ' + isoDate(now)
    });

    function setFont(style, size, color) {
      doc.setFont(FONT, style || 'normal');
      if (size) doc.setFontSize(size);
      if (color) doc.setTextColor(color[0], color[1], color[2]);
    }

    var y = 0;

    function ensureSpace(h) {
      if (y + h > PAGE_H - BOTTOM) {
        doc.addPage();
        y = TOP_CONT;
      }
    }

    function drawLogo(x, top, width) {
      var L = NS.logo;
      var s = width / L.width;
      L.paths.forEach(function (p) {
        var rgb = hexToRgb(p.fill);
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        L.parse(p.d).forEach(function (seg) {
          var q = seg.pts;
          function X(v) { return x + (v + p.dx) * s; }
          function Y(v) { return top + (v + p.dy) * s; }
          if (seg.op === 'M') doc.moveTo(X(q[0]), Y(q[1]));
          else if (seg.op === 'L') doc.lineTo(X(q[0]), Y(q[1]));
          else if (seg.op === 'C') doc.curveTo(X(q[0]), Y(q[1]), X(q[2]), Y(q[3]), X(q[4]), Y(q[5]));
          else if (seg.op === 'Z') doc.close();
        });
        doc.fillEvenOdd();
      });
    }

    var baseTable = {
      theme: 'plain',
      margin: { left: MX, right: MX, top: TOP_CONT, bottom: BOTTOM },
      styles: {
        font: FONT, fontSize: 9.5, textColor: C.navy, cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
        overflow: 'linebreak', lineColor: C.grey200, valign: 'top'
      },
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: C.grey50 }
    };

    function table(o) {
      var merged = {};
      Object.keys(baseTable).forEach(function (k) { merged[k] = baseTable[k]; });
      Object.keys(o).forEach(function (k) { merged[k] = o[k]; });
      merged.styles = Object.assign({}, baseTable.styles, o.styles || {});
      merged.startY = y;
      autoTable(merged);
      y = doc.lastAutoTable.finalY + 6;
    }

    function missing(text) {
      return { content: T(text || 'Not provided'), styles: { textColor: C.orangeDark, fontStyle: ITALIC } };
    }
    function val(v, fallback) {
      return v && String(v).trim() ? T(String(v).trim()) : missing(fallback);
    }
    function plain(text, color, style) {
      return { content: T(text), styles: { textColor: color || C.navy, fontStyle: style || 'normal' } };
    }
    function answerCell(value) {
      if (!value) return missing('Not answered');
      var opt = (cfg.answerOptions || []).filter(function (o) { return o.value === value; })[0];
      var color = { ok: C.tealDark, warn: C.orange, bad: C.red, neutral: C.grey600 }[opt ? opt.tone : 'neutral'];
      return { content: T(opt ? opt.label : value), styles: { textColor: color, fontStyle: 'bold' } };
    }
    function confirmCell(ok) {
      return ok
        ? { content: T('Confirmed'), styles: { textColor: C.tealDark, fontStyle: 'bold' } }
        : { content: T('NOT confirmed'), styles: { textColor: C.red, fontStyle: 'bold' } };
    }
    function kv(rows) {
      table({
        body: rows.map(function (r) { return [T(r[0]), r[1]]; }),
        columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold', textColor: C.grey600 } }
      });
    }

    function sectionHeading(num, title, color) {
      ensureSpace(24);
      var c = color || C.navy;
      doc.setFillColor(c[0], c[1], c[2]);
      doc.circle(MX + 4, y + 0.8, 4, 'F');
      setFont('bold', 11, C.white);
      doc.text(String(num), MX + 4, y + 2.4, { align: 'center' });
      setFont('bold', 15, C.navy);
      doc.text(T(title), MX + 11, y + 2.8);
      y += 10;
    }

    function paragraph(text, size, color, style) {
      setFont(style || 'normal', size || 9.5, color || C.grey600);
      var lines = doc.splitTextToSize(T(text), PAGE_W - 2 * MX);
      var lh = (size || 9.5) * 0.3528 * 1.45;
      ensureSpace(lines.length * lh + 2);
      doc.text(lines, MX, y + lh * 0.75);
      y += lines.length * lh + 3;
    }

    /* ---------------- Page 1 header ---------------- */
    doc.setFillColor(C.navy[0], C.navy[1], C.navy[2]);
    doc.rect(0, 0, PAGE_W, 6, 'F');
    drawLogo(MX, 12, 30);
    doc.setDrawColor(C.grey200[0], C.grey200[1], C.grey200[2]);
    doc.setLineWidth(0.3);
    doc.line(MX + 36, 13, MX + 36, 28);
    setFont('normal', 9, C.grey600);
    doc.text(T(cfg.organisation), MX + 40, 18);
    setFont('bold', 12, C.navy);
    doc.text(T(cfg.groupName + ' · Offboarding'), MX + 40, 24);

    y = 42;
    setFont('bold', 22, C.navy);
    doc.text(T(cfg.reportTitle), MX, y);
    y += 8;
    setFont('normal', 12, C.navy);
    doc.text(personLine, MX, y);
    y += 6;
    setFont('normal', 9.5, C.grey600);
    doc.text(T('Generated on ' + stamp), MX, y);
    y += 4;
    doc.setFillColor(C.teal[0], C.teal[1], C.teal[2]);
    doc.rect(MX, y, 24, 1.2, 'F');
    y += 7;

    // status box
    var ok = issues.length === 0;
    var boxFill = ok ? C.tealLight : C.orangeLight;
    var boxEdge = ok ? C.teal : C.orange;
    doc.setFillColor(boxFill[0], boxFill[1], boxFill[2]);
    doc.rect(MX, y, PAGE_W - 2 * MX, 16, 'F');
    doc.setFillColor(boxEdge[0], boxEdge[1], boxEdge[2]);
    doc.rect(MX, y, 1.6, 16, 'F');
    setFont('bold', 11, ok ? C.tealDark : C.orangeDark);
    doc.text(T(ok ? 'Complete: all ' + validation.total + ' checks are fulfilled.'
      : issues.length + ' open item' + (issues.length === 1 ? '' : 's') + ' (' + validation.done + ' of ' + validation.total + ' checks fulfilled)'), MX + 6, y + 6.5);
    setFont('normal', 9, C.navy);
    doc.text(T(ok ? state.projects.length + ' project' + (state.projects.length === 1 ? '' : 's') + ' documented. Send this report to ' + cfg.sendTo + '.'
      : 'Open items are highlighted in orange and listed at the end of this report.'), MX + 6, y + 12);
    y += 24;

    /* ---------------- 1. General ---------------- */
    sectionHeading(1, 'General information');
    kv([
      ['Name', val(g.name)],
      ['u-number', val(g.uNumber)],
      ['VSC account', g.vscNone ? plain('No VSC account', C.grey600, ITALIC) : val(g.vscAccount)],
      ['Supervisor', val(g.supervisor)],
      ['Last working day', val(formatDay(g.lastDay))]
    ]);
    ensureSpace(20);
    table({
      head: [[T('Confirmation'), T('Status')]],
      body: [
        [T('No more research data on my personal OneDrive'), confirmCell(g.oneDriveConfirmed)],
        [T('No more data or code in private GitLab repositories (all moved to the ' + cfg.gitlab.namespace + ' namespace)'), confirmCell(g.gitlabConfirmed)]
      ],
      columnStyles: { 1: { cellWidth: 38 } }
    });

    /* ---------------- 2. Projects ---------------- */
    y += 2;
    sectionHeading(2, 'Projects');
    if (!state.projects.length) {
      paragraph('No projects were added.', 10, C.orangeDark, ITALIC);
    }
    state.projects.forEach(function (p, i) {
      var accent = ACCENTS[i % ACCENTS.length];
      setFont('bold', 13, C.navy);
      var titleLines = doc.splitTextToSize(T(p.name.trim() || 'Untitled project'), PAGE_W - 2 * MX - 6).slice(0, 3);
      var titleH = 8 + titleLines.length * 5.6;
      ensureSpace(titleH + 60); // keep the project header together with its first rows
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(MX, y - 1, 1.6, titleH - 2, 'F');
      setFont('bold', 8, C.grey600);
      doc.text(T('PROJECT ' + (i + 1)), MX + 5, y + 2);
      setFont('bold', 13, p.name.trim() ? C.navy : C.orangeDark);
      doc.text(titleLines, MX + 5, y + 8, { lineHeightFactor: 1.2 });
      y += titleH + 1;

      function yesNo(v) {
        return v === 'yes' ? plain('Yes', C.navy, 'bold') : v === 'no' ? T('No') : missing('Not answered');
      }
      var rows = [
        ['Taken over by', p.successor ? T(p.successor) : plain('Not yet known', C.grey600, ITALIC)],
        ['Personal / sensitive data', yesNo(p.sensitive)]
      ];
      if (p.sensitive === 'yes') rows.push(['Pseudonymisation keys stored at', val(p.keysLocation)]);
      if (p.retentionSpecific === 'yes') {
        rows.push(['Retention period', p.retention ? T(p.retention) : (p.deletion ? plain('Not specified', C.grey600, ITALIC) : missing())]);
        rows.push(['Deletion requirements', p.deletion ? T(p.deletion) : plain('None specified', C.grey600, ITALIC)]);
      } else {
        rows.push(['Specific retention / deletion requirements', p.retentionSpecific === 'no'
          ? plain('No (standard policy applies)', C.navy) : missing('Not answered')]);
      }
      if (p.depositionsRequired === 'yes') {
        rows.push(['Required depositions completed', answerCell(p.depositions)]);
        if (p.depositionsComment || p.depositions === 'partial' || p.depositions === 'no') {
          rows.push(['Open depositions', val(p.depositionsComment)]);
        }
      } else {
        rows.push(['Required depositions', p.depositionsRequired === 'no' ? plain('None required', C.navy) : missing('Not answered')]);
      }
      kv(rows);

      // locations
      var locBody = [];
      (cfg.categories || []).forEach(function (cat) {
        var loc = p.locations[cat.key];
        if (loc.na) {
          locBody.push([{ content: T(cat.label), styles: { fontStyle: 'bold' } }, { content: T('Not applicable'), colSpan: 2, styles: { textColor: C.grey600, fontStyle: ITALIC } }]);
          return;
        }
        var items = loc.items.filter(function (it) { return !NS.model.isEmptyLocation(it); });
        if (!items.length) {
          locBody.push([{ content: T(cat.label), styles: { fontStyle: 'bold' } }, Object.assign(missing('No location given'), { colSpan: 2 })]);
          return;
        }
        items.forEach(function (it, j) {
          var row = [];
          if (j === 0) row.push({ content: T(cat.label), rowSpan: items.length, styles: { fontStyle: 'bold' } });
          var typeLabel = it.type ? labelOf(cfg.locationTypes, it.type).replace(/…$/, '') : '';
          if (it.type === 'other') typeLabel = 'Other: ' + (it.other || '?');
          row.push(typeLabel ? (it.type === 'other' && !it.other ? missing('Other (not specified)') : T(typeLabel)) : missing('Type missing'));
          row.push(val(it.path, 'Path / URL missing'));
          locBody.push(row);
        });
      });
      ensureSpace(24);
      table({
        head: [[T('Category'), T('Location'), T('Path / URL')]],
        body: locBody,
        alternateRowStyles: {},
        theme: 'grid',
        styles: { lineWidth: 0.2 },
        columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 36 } }
      });

      // published outputs
      if (p.publishedAny !== 'yes') {
        kv([['Published datasets & code', p.publishedAny === 'no'
          ? plain('Nothing published (yet)', C.grey600, ITALIC) : missing('Not answered')]]);
      } else {
        var pubs = p.published.items.filter(function (it) { return !NS.model.isEmptyPublished(it); });
        if (!pubs.length) {
          kv([['Published datasets & code', missing('Yes, but no details given')]]);
        } else {
          ensureSpace(24);
          table({
            head: [[T('Published output'), T('Repository'), T('DOI / accession / URL'), T('Licence')]],
            body: pubs.map(function (it) {
              return [it.kind ? T(labelOf(cfg.publishedKinds, it.kind)) : missing('Type missing'),
                it.repository ? T(it.repository) : '', val(it.identifier, 'Missing'), it.licence ? T(it.licence) : ''];
            }),
            theme: 'grid',
            alternateRowStyles: {},
            styles: { lineWidth: 0.2 },
            columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 34 }, 3: { cellWidth: 28 } }
          });
        }
      }
      y += 3;
    });

    /* ---------------- 3. Code checklist ---------------- */
    sectionHeading(3, 'Code checklist (all repositories)');
    // two rows per item (bold label, small grey help); the answer spans both
    var codeBody = [];
    (cfg.codeChecks || []).forEach(function (c, i) {
      var fill = i % 2 ? C.white : C.grey50;
      var answer = answerCell(state.code[c.id]);
      answer.rowSpan = 2;
      answer.styles = Object.assign({ fillColor: fill }, answer.styles);
      codeBody.push([
        { content: T(c.label), styles: { fontStyle: 'bold', fillColor: fill, cellPadding: { top: 2.2, bottom: 0.4, left: 3, right: 3 } } },
        answer
      ]);
      codeBody.push([{ content: T(c.help), styles: { fontSize: 8.5, textColor: C.grey600, fillColor: fill, cellPadding: { top: 0, bottom: 2.4, left: 3, right: 3 } } }]);
    });
    table({
      head: [[T('Item'), T('Answer')]],
      body: codeBody,
      alternateRowStyles: {},
      columnStyles: { 1: { cellWidth: 30 } }
    });
    var anyDeviation = (cfg.codeChecks || []).some(function (c) { return state.code[c.id] && state.code[c.id] !== 'yes'; });
    kv([['Deviations / comments', state.code.comments ? T(state.code.comments)
      : anyDeviation ? missing('Missing: deviations must be explained') : plain('None', C.grey600, ITALIC)]]);

    /* ---------------- Open items ---------------- */
    if (issues.length) {
      y += 2;
      sectionHeading(4, 'Open items', C.orange);
      table({
        head: [[T('Section'), T('Open item')]],
        headStyles: { fillColor: C.orange, textColor: C.white, fontStyle: 'bold', fontSize: 9 },
        body: issues.map(function (it) { return [T(it.section), T(it.msg)]; }),
        columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' } }
      });
    }

    /* ---------------- Closing note ---------------- */
    ensureSpace(22);
    y += 2;
    doc.setFillColor(C.navy[0], C.navy[1], C.navy[2]);
    doc.rect(MX, y, PAGE_W - 2 * MX, 15, 'F');
    setFont('bold', 10.5, C.white);
    doc.text(T('Next step: send this PDF to ' + cfg.sendTo + '.'), MX + 6, y + 6.3);
    setFont('normal', 8.5, C.white);
    doc.text(T('This report reflects the answers entered on ' + stamp + '.'), MX + 6, y + 11);
    y += 20;

    /* ---------------- Running header + footer ---------------- */
    var n = doc.getNumberOfPages();
    for (var pg = 1; pg <= n; pg++) {
      doc.setPage(pg);
      if (pg > 1) {
        doc.setFillColor(C.navy[0], C.navy[1], C.navy[2]);
        doc.rect(0, 0, PAGE_W, 3, 'F');
        drawLogo(MX, 8, 16);
        setFont('bold', 9, C.navy);
        doc.text(T(cfg.reportTitle), PAGE_W - MX, 12, { align: 'right' });
        setFont('normal', 8.5, C.grey600);
        doc.text(personLine, PAGE_W - MX, 16.5, { align: 'right' });
        doc.setDrawColor(C.grey200[0], C.grey200[1], C.grey200[2]);
        doc.setLineWidth(0.3);
        doc.line(MX, 21, PAGE_W - MX, 21);
      }
      doc.setDrawColor(C.grey200[0], C.grey200[1], C.grey200[2]);
      doc.setLineWidth(0.3);
      doc.line(MX, PAGE_H - 15, PAGE_W - MX, PAGE_H - 15);
      setFont('normal', 7.5, C.grey600);
      doc.text(T(cfg.groupName + ' · ' + cfg.reportTitle + ' · ' + personLine), MX, PAGE_H - 10);
      doc.text(T('Generated ' + isoDate(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())), MX, PAGE_H - 6.5);
      setFont('bold', 7.5, C.navy);
      doc.text(T('Page ' + pg + ' of ' + n), PAGE_W - MX, PAGE_H - 10, { align: 'right' });
    }
    doc.setPage(n);
    return doc;
  }

  NS.pdf = { build: build, filename: filename, formatTimestamp: formatTimestamp, isoDate: isoDate, latin1: latin1 };
})(typeof window !== 'undefined' ? window : globalThis);
