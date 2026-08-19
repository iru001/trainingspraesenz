/**
 * Trainingspräsenz – Backend
 *
 * Läuft als Google-Apps-Skript hinter einer Google-Tabelle und speichert die
 * Daten der App. Zusätzlich schreibt es die Anwesenheiten bei jeder Speicherung
 * in lesbare Tabellenblätter, die sich direkt als Excel herunterladen lassen.
 *
 * Einrichtung: siehe SETUP.md im Repository.
 */

/**
 * PIN fuer den ersten Start. Nimm mindestens sechs Ziffern – die Adresse der
 * App ist oeffentlich, der PIN ist der einzige Zugangsschutz.
 * Aendern kannst du beide spaeter jederzeit in der App unter Admin -> Team;
 * diese Datei musst du dafuer nicht mehr anfassen.
 */
var ERSTER_PIN = '';          // z. B. '482915'
var ERSTER_ADMIN_PIN = '';    // z. B. '204871'

var DATA_SHEET = '_daten';        // technisches Blatt mit dem Datenbestand
var CHUNK = 40000;                // max. Zeichen pro Zelle
var LOCK_MS = 25000;

/* ============================ Anfragen ============================ */

function doGet(e) {
  // Nur für den Funktionstest im Browser gedacht.
  return HtmlService.createHtmlOutput(
    '<p style="font:16px system-ui">Trainingspräsenz-Backend läuft. ' +
    'Diese Adresse gehört in die Datei <code>docs/config.js</code>.</p>');
}

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { p = e.parameter || {}; }
  return json(handle(p));
}

function handle(p) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(LOCK_MS); } catch (err) { return { ok: false, error: 'busy' }; }
  try {
    var state = readState();
    if (!state.settings.pin) return { ok: false, error: 'nopin' };
    if (String(p.pin || '') !== String(state.settings.pin || '')) {
      penalize();
      return { ok: false, error: 'pin' };
    }
    clearPenalty();

    if (p.action === 'save') {
      var incoming = p.state;
      if (!incoming || !incoming.settings) return { ok: false, error: 'bad_state' };
      var have = Number(state.rev || 0);
      if (Number(p.rev) !== have) {
        // Jemand anders war schneller – die aktuelle Fassung zurückgeben.
        return { ok: false, error: 'conflict', state: state };
      }
      incoming.rev = have + 1;
      writeState(incoming);
      try { renderSheets(incoming); } catch (err) { /* Darstellung darf das Speichern nie verhindern */ }
      return { ok: true, rev: incoming.rev };
    }
    return { ok: true, state: state, sheetUrl: book().getUrl() };
  } catch (err) {
    return { ok: false, error: 'server', message: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Bremse gegen das Durchprobieren des PIN. Nach jedem Fehlversuch antwortet
 * der Server etwas langsamer; nach einer Stunde ohne Fehlversuch beginnt die
 * Zaehlung von vorn. Niemand wird ausgesperrt - Durchprobieren dauert damit
 * aber Tage statt Minuten.
 */
var FAIL_KEY = 'pinFails';
var FAIL_TIME = 'pinFailsSince';
var FAIL_WINDOW_MS = 60 * 60 * 1000;
var FAIL_MAX_SLEEP = 8000;

function penalize() {
  var props = PropertiesService.getScriptProperties();
  var since = Number(props.getProperty(FAIL_TIME) || 0);
  var now = new Date().getTime();
  var n = (now - since > FAIL_WINDOW_MS) ? 0 : Number(props.getProperty(FAIL_KEY) || 0);
  n++;
  props.setProperty(FAIL_KEY, String(n));
  props.setProperty(FAIL_TIME, String(now));
  Utilities.sleep(Math.min(FAIL_MAX_SLEEP, 200 * n));
}

function clearPenalty() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(FAIL_KEY)) props.deleteProperty(FAIL_KEY);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================ Datenbestand ============================ */

function book() { return SpreadsheetApp.getActiveSpreadsheet(); }

function dataSheet() {
  var sh = book().getSheetByName(DATA_SHEET);
  if (!sh) {
    sh = book().insertSheet(DATA_SHEET);
    sh.hideSheet();
  }
  return sh;
}

function readState() {
  var sh = dataSheet();
  var last = sh.getLastRow();
  var raw = '';
  if (last > 0) {
    var vals = sh.getRange(1, 1, last, 1).getValues();
    for (var i = 0; i < vals.length; i++) raw += String(vals[i][0] || '');
  }
  if (!raw) {
    var seed = SEED();
    writeState(seed);
    try { renderSheets(seed); } catch (err) {}
    return seed;
  }
  return JSON.parse(raw);
}

function writeState(state) {
  var raw = JSON.stringify(state);
  var parts = [];
  for (var i = 0; i < raw.length; i += CHUNK) parts.push([raw.substr(i, CHUNK)]);
  if (!parts.length) parts = [['']];
  var sh = dataSheet();
  sh.clear();
  sh.getRange(1, 1, parts.length, 1).setValues(parts);
}

/* ============================ Lesbare Blätter ============================ */

var DOW = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
var ST = { present: 'A', late: 'V', excused: 'E', absent: 'F' };

function sheetNamed(name) {
  var sh = book().getSheetByName(name);
  if (!sh) sh = book().insertSheet(name);
  sh.clear();
  return sh;
}

function put(sh, rows, headerRows) {
  if (!rows.length) return;
  var width = 0;
  rows.forEach(function (r) { width = Math.max(width, r.length); });
  rows.forEach(function (r) { while (r.length < width) r.push(''); });
  sh.getRange(1, 1, rows.length, width).setValues(rows);
  var h = headerRows || 1;
  sh.getRange(1, 1, h, width).setFontWeight('bold');
  sh.setFrozenRows(h);
  sh.autoResizeColumns(1, Math.min(width, 30));
}

function nameOf(p) { return ((p.first || '') + ' ' + (p.last || '')).trim(); }

function byLast(a, b) {
  var x = ((a.last || '') + ' ' + (a.first || '')).toLowerCase();
  var y = ((b.last || '') + ' ' + (b.first || '')).toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function fmtDay(iso) {
  if (!iso) return '';
  var a = String(iso).split('-');
  return a.length === 3 ? a[2] + '.' + a[1] + '.' + a[0] : iso;
}

function weekdayOf(iso) {
  var a = String(iso).split('-');
  if (a.length !== 3) return '';
  return DOW[new Date(+a[0], +a[1] - 1, +a[2]).getDay()];
}

function coachNames(state, ids) {
  return (ids || []).map(function (id) {
    for (var i = 0; i < state.coaches.length; i++) if (state.coaches[i].id === id) return nameOf(state.coaches[i]);
    return null;
  }).filter(function (x) { return x; }).join(', ');
}

function renderSheets(state) {
  var players = state.players.slice().sort(byLast);
  var recs = state.records.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

  // --- Kader ---
  var sh = sheetNamed('Kader');
  var rows = [['Nr.', 'Nachname', 'Vorname', 'Status']];
  players.forEach(function (p, i) {
    rows.push([i + 1, p.last || '', p.first || '', p.active === false ? 'inaktiv' : 'aktiv']);
  });
  put(sh, rows);

  // --- Trainer ---
  sh = sheetNamed('Trainer');
  rows = [['Nachname', 'Vorname', 'Funktion', 'Status', 'Einsätze']];
  state.coaches.slice().sort(byLast).forEach(function (c) {
    var n = 0;
    recs.forEach(function (r) { if ((r.coachIds || []).indexOf(c.id) >= 0) n++; });
    rows.push([c.last || '', c.first || '', c.role || '', c.active === false ? 'inaktiv' : 'aktiv', n]);
  });
  put(sh, rows);

  // --- Auswertung ---
  var stats = {};
  players.forEach(function (p) { stats[p.id] = { present: 0, late: 0, excused: 0, absent: 0, total: 0 }; });
  recs.forEach(function (r) {
    for (var pid in r.entries) {
      if (!stats[pid]) stats[pid] = { present: 0, late: 0, excused: 0, absent: 0, total: 0 };
      var k = r.entries[pid];
      if (stats[pid][k] === undefined) continue;
      stats[pid][k]++; stats[pid].total++;
    }
  });
  sh = sheetNamed('Auswertung');
  rows = [['Nachname', 'Vorname', 'Anwesend', 'Verspätet', 'Entschuldigt', 'Fehlt', 'Erfasste Termine', 'Quote']];
  players.forEach(function (p) {
    var s = stats[p.id] || { present: 0, late: 0, excused: 0, absent: 0, total: 0 };
    var here = s.present + s.late;
    rows.push([p.last || '', p.first || '', s.present, s.late, s.excused, s.absent, s.total,
      s.total ? here / s.total : '']);
  });
  put(sh, rows);
  if (players.length) sh.getRange(2, 8, players.length, 1).setNumberFormat('0%');

  // --- Termine ---
  sh = sheetNamed('Termine');
  rows = [['Datum', 'Wochentag', 'Von', 'Bis', 'Art', 'Bezeichnung', 'Trainer', 'Anwesend', 'Erfasst', 'Quote', 'Notiz']];
  recs.forEach(function (r) {
    var here = 0, tot = 0;
    for (var k in r.entries) { tot++; if (r.entries[k] === 'present' || r.entries[k] === 'late') here++; }
    rows.push([fmtDay(r.date), weekdayOf(r.date), r.time || '', r.timeEnd || '',
      r.type === 'match' ? 'Wettkampf' : 'Training', r.label || '', coachNames(state, r.coachIds),
      here, tot, tot ? here / tot : '', r.note || '']);
  });
  put(sh, rows);
  if (recs.length) sh.getRange(2, 10, recs.length, 1).setNumberFormat('0%');

  // --- Matrix ---
  sh = sheetNamed('Matrix');
  var head = ['Nachname', 'Vorname'];
  recs.forEach(function (r) { head.push(fmtDay(r.date) + (r.type === 'match' ? ' (W)' : '')); });
  head.push('Quote');
  rows = [head];
  players.forEach(function (p) {
    var row = [p.last || '', p.first || ''];
    recs.forEach(function (r) { row.push(ST[r.entries[p.id]] || ''); });
    var s = stats[p.id] || { present: 0, late: 0, total: 0 };
    row.push(s.total ? (s.present + s.late) / s.total : '');
    rows.push(row);
  });
  put(sh, rows);
  if (players.length && recs.length) {
    sh.getRange(2, head.length, players.length, 1).setNumberFormat('0%');
  }

  // --- Legende ---
  sh = sheetNamed('Legende');
  put(sh, [
    ['Zeichen', 'Bedeutung'],
    ['A', 'anwesend'],
    ['V', 'verspätet'],
    ['E', 'entschuldigt'],
    ['F', 'fehlt'],
    ['(W)', 'Wettkampf statt Training'],
    ['', ''],
    ['Quote', '(anwesend + verspätet) geteilt durch die erfassten Termine des Spielers'],
    ['Achtung', 'Diese Blätter werden bei jeder Speicherung in der App neu geschrieben. Eigene Eingaben hier gehen verloren.']
  ]);
}

/* ============================ Startdaten ============================ */
/**
 * Wird nur ein einziges Mal verwendet: beim allerersten Aufruf, solange die
 * Tabelle noch leer ist. Danach lebt der Datenbestand in der Tabelle und wird
 * ausschliesslich ueber die App veraendert.
 *
 * Spieler, Trainer und Termine traegst du bequem in der App unter "Admin" ein –
 * hier musst du nichts eintippen. Einzige Pflichtangabe ist der PIN oben.
 */
function SEED() {
  return {
    v: 1,
    rev: 1,
    settings: {
      team: "",
      season: "",
      seasonStart: "",
      seasonEnd: "",
      pin: ERSTER_PIN,
      adminPin: ERSTER_ADMIN_PIN
    },
    coaches: [],
    players: [],
    rules: [],
    singles: [],
    records: []
  };
}
