/*
 * Data model + validation. No DOM access, so it can be unit-tested in Node.
 */
(function (root) {
  'use strict';

  var NS = (root.Offboarding = root.Offboarding || {});
  var CATEGORY_KEYS = ['raw', 'processed', 'code'];
  var CODE_CHECK_IDS = ['readme', 'envs', 'exampleData'];

  function uid() {
    return 'p' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function emptyLocation() {
    return { type: '', other: '', path: '' };
  }

  function emptyPublished() {
    return { kind: '', repository: '', identifier: '', licence: '' };
  }

  function newProject() {
    var locations = {};
    CATEGORY_KEYS.forEach(function (k) {
      locations[k] = { na: false, items: [emptyLocation()] };
    });
    return {
      id: uid(),
      name: '',
      successor: '',
      locations: locations,
      // Each block is gated by a quick yes/no question; details are only asked for "yes".
      sensitive: '',            // yes | no
      keysLocation: '',
      publishedAny: '',         // yes | no
      published: { items: [] },
      retentionSpecific: '',    // yes | no
      retention: '',
      deletion: '',
      depositionsRequired: '',  // yes | no
      depositions: '',          // yes | partial | no  (all required depositions done?)
      depositionsComment: ''
    };
  }

  var PROJECT_STRING_KEYS = ['name', 'successor', 'sensitive', 'keysLocation', 'publishedAny', 'retentionSpecific',
    'retention', 'deletion', 'depositionsRequired', 'depositions', 'depositionsComment'];

  function newState() {
    return {
      v: 1,
      general: {
        name: '',
        uNumber: '',
        vscAccount: '',
        vscNone: false,
        supervisor: '',
        lastDay: '',
        oneDriveConfirmed: false,
        gitlabConfirmed: false
      },
      projects: [newProject()],
      code: { readme: '', envs: '', exampleData: '', comments: '' },
      createdAt: new Date().toISOString(),
      updatedAt: null
    };
  }

  function str(v) {
    return typeof v === 'string' ? v : v == null ? '' : String(v);
  }

  function bool(v) {
    return v === true;
  }

  /* Merge whatever was loaded from storage onto a fresh state, so missing
   * or malformed fields never break the UI. */
  function normalize(raw) {
    var s = newState();
    if (!raw || typeof raw !== 'object') return s;
    var g = raw.general || {};
    Object.keys(s.general).forEach(function (k) {
      s.general[k] = typeof s.general[k] === 'boolean' ? bool(g[k]) : str(g[k]);
    });
    if (Array.isArray(raw.projects)) {
      s.projects = raw.projects.map(function (rp) {
        var p = newProject();
        rp = rp || {};
        p.id = str(rp.id) || p.id;
        PROJECT_STRING_KEYS.forEach(function (k) { p[k] = str(rp[k]); });
        CATEGORY_KEYS.forEach(function (c) {
          var rc = (rp.locations || {})[c] || {};
          p.locations[c].na = bool(rc.na);
          if (Array.isArray(rc.items)) {
            p.locations[c].items = rc.items.map(function (it) {
              it = it || {};
              return { type: str(it.type), other: str(it.other), path: str(it.path) };
            });
          }
          if (!p.locations[c].items.length) p.locations[c].items = [emptyLocation()];
        });
        var pub = rp.published || {};
        if (Array.isArray(pub.items)) {
          p.published.items = pub.items.map(function (it) {
            it = it || {};
            return { kind: str(it.kind), repository: str(it.repository), identifier: str(it.identifier), licence: str(it.licence) };
          });
        }
        // migrate answers saved by the first version (no gate questions)
        if (!p.publishedAny) {
          if (pub.none === true) p.publishedAny = 'no';
          else if (p.published.items.some(function (it) { return !isEmptyPublished(it); })) p.publishedAny = 'yes';
        }
        if (!p.retentionSpecific && (!blank(p.retention) || !blank(p.deletion))) p.retentionSpecific = 'yes';
        if (!p.depositionsRequired) {
          if (p.depositions === 'na') { p.depositionsRequired = 'no'; p.depositions = ''; }
          else if (p.depositions) p.depositionsRequired = 'yes';
        }
        return p;
      });
    }
    var c = raw.code || {};
    Object.keys(s.code).forEach(function (k) { s.code[k] = str(c[k]); });
    s.createdAt = str(raw.createdAt) || s.createdAt;
    s.updatedAt = raw.updatedAt ? str(raw.updatedAt) : null;
    if (!s.projects.length) s.projects.push(newProject()); // always start with one project
    return s;
  }

  function blank(v) {
    return !v || !String(v).trim();
  }

  function isEmptyLocation(it) {
    return blank(it.type) && blank(it.other) && blank(it.path);
  }

  function isEmptyPublished(it) {
    return blank(it.kind) && blank(it.repository) && blank(it.identifier) && blank(it.licence);
  }

  function projectLabel(p, i) {
    return 'Project ' + (i + 1) + (blank(p.name) ? '' : ' (' + p.name.trim() + ')');
  }

  /*
   * Returns { issues: [{field, section, msg}], total, done }.
   * `field` is the data path of the input the issue refers to.
   */
  function validate(state, config) {
    var issues = [];
    var total = 0;
    var pat = (config && config.patterns) || {};
    var categories = (config && config.categories) || CATEGORY_KEYS.map(function (k) { return { key: k, label: k }; });

    function check(ok, field, section, msg) {
      total++;
      if (!ok) issues.push({ field: field, section: section, msg: msg });
    }
    function matches(value, p) {
      if (!p || !p.regex) return true;
      return new RegExp(p.regex, 'i').test(String(value).trim());
    }

    var g = state.general;
    var S = 'General';
    check(!blank(g.name), 'general.name', S, 'Your name is missing');
    if (blank(g.uNumber)) {
      check(false, 'general.uNumber', S, 'Your u-number is missing');
    } else {
      check(matches(g.uNumber, pat.uNumber), 'general.uNumber', S,
        'The u-number looks unusual (expected e.g. ' + ((pat.uNumber || {}).example || 'u0123456') + ')');
    }
    if (!g.vscNone) {
      if (blank(g.vscAccount)) {
        check(false, 'general.vscAccount', S, 'VSC account missing (or tick “I don’t have a VSC account”)');
      } else {
        check(matches(g.vscAccount, pat.vsc), 'general.vscAccount', S,
          'The VSC account looks unusual (expected e.g. ' + ((pat.vsc || {}).example || 'vsc12345') + ')');
      }
    }
    check(!blank(g.supervisor), 'general.supervisor', S, 'Supervisor is missing');
    check(!blank(g.lastDay), 'general.lastDay', S, 'Last working day is missing');
    check(g.oneDriveConfirmed, 'general.oneDriveConfirmed', S, 'Not confirmed: no data left on personal OneDrive');
    check(g.gitlabConfirmed, 'general.gitlabConfirmed', S, 'Not confirmed: no data or code left in private GitLab repositories');

    check(state.projects.length > 0, 'projects', 'Projects', 'No project added');

    state.projects.forEach(function (p, i) {
      var P = projectLabel(p, i);
      var base = 'projects.' + i;
      check(!blank(p.name), base + '.name', P, 'Project name is missing');

      categories.forEach(function (cat) {
        var loc = p.locations[cat.key];
        var lbase = base + '.locations.' + cat.key;
        if (loc.na) { total++; return; }
        var rows = loc.items.map(function (it, j) { return { it: it, j: j }; })
          .filter(function (r) { return !isEmptyLocation(r.it); });
        if (!rows.length) {
          check(false, lbase + '.items.0.type', P, cat.label + ': no location given (or tick “Not applicable”)');
          return;
        }
        rows.forEach(function (r) {
          var f = lbase + '.items.' + r.j;
          var n = loc.items.length > 1 ? ' (location ' + (r.j + 1) + ')' : '';
          check(!blank(r.it.type), f + '.type', P, cat.label + n + ': location type missing');
          if (r.it.type === 'other') {
            check(!blank(r.it.other), f + '.other', P, cat.label + n + ': specify what “Other” is');
          }
          check(!blank(r.it.path), f + '.path', P, cat.label + n + ': path or URL missing');
        });
      });

      check(!blank(p.sensitive), base + '.sensitive', P, 'Sensitive data: answer yes or no');
      if (p.sensitive === 'yes') {
        check(!blank(p.keysLocation), base + '.keysLocation', P, 'Location of pseudonymisation keys missing');
      }

      check(!blank(p.publishedAny), base + '.publishedAny', P, 'Published datasets / code: answer yes or no');
      if (p.publishedAny === 'yes') {
        var pubs = p.published.items.map(function (it, j) { return { it: it, j: j }; })
          .filter(function (r) { return !isEmptyPublished(r.it); });
        if (!pubs.length) {
          check(false, base + '.published.items.0.identifier', P, 'Published outputs: add at least one entry');
        } else {
          pubs.forEach(function (r) {
            var f = base + '.published.items.' + r.j;
            check(!blank(r.it.kind), f + '.kind', P, 'Published output ' + (r.j + 1) + ': type missing');
            check(!blank(r.it.identifier), f + '.identifier', P, 'Published output ' + (r.j + 1) + ': DOI / accession / URL missing');
          });
        }
      }

      check(!blank(p.retentionSpecific), base + '.retentionSpecific', P, 'Retention / deletion requirements: answer yes or no');
      if (p.retentionSpecific === 'yes') {
        check(!blank(p.retention) || !blank(p.deletion), base + '.retention', P, 'Describe the retention period or deletion requirements');
      }

      check(!blank(p.depositionsRequired), base + '.depositionsRequired', P, 'Required depositions: answer yes or no');
      if (p.depositionsRequired === 'yes') {
        check(!blank(p.depositions), base + '.depositions', P, 'Required depositions: are they all completed?');
        if (p.depositions === 'partial' || p.depositions === 'no') {
          check(!blank(p.depositionsComment), base + '.depositionsComment', P, 'Explain which depositions are still open');
        }
      }
    });

    var C = 'Code checklist';
    var deviates = false;
    var checks = (config && config.codeChecks) || CODE_CHECK_IDS.map(function (id) { return { id: id, label: id }; });
    checks.forEach(function (c) {
      var v = state.code[c.id];
      check(!blank(v), 'code.' + c.id, C, '“' + c.label + '” not answered');
      if (!blank(v) && v !== 'yes') deviates = true;
    });
    if (deviates) {
      check(!blank(state.code.comments), 'code.comments', C, 'Describe the deviations in the comment field');
    }

    return { issues: issues, total: total, done: total - issues.length };
  }

  NS.model = {
    CATEGORY_KEYS: CATEGORY_KEYS,
    newState: newState,
    newProject: newProject,
    emptyLocation: emptyLocation,
    emptyPublished: emptyPublished,
    normalize: normalize,
    validate: validate,
    isEmptyLocation: isEmptyLocation,
    isEmptyPublished: isEmptyPublished,
    blank: blank
  };
})(typeof window !== 'undefined' ? window : globalThis);
