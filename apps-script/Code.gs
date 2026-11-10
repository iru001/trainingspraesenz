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
var DATA_SHEET_NEXT = '_daten_neu'; // Zwischenspeicher, damit ein Abbruch den alten Stand nicht loescht
var CHUNK = 40000;                // max. Zeichen pro Zelle
var LOCK_MS = 25000;

// Obergrenzen gegen aufgeblaehte oder boesartige Datenmengen
// MAX_BODY grosszuegig bemessen: der gesamte Datenbestand wird bei jeder
// Speicherung komplett uebertragen (keine Delta-Uebertragung), waechst also mit
// jedem Termin/jeder Saison weiter. 300000 wurde bereits nach 2-3 Saisons
// erreicht und haette danach JEDE weitere Speicherung dauerhaft blockiert.
var MAX_BODY = 3000000;           // Zeichen pro Anfrage
var MAX_PLAYERS = 300;
var MAX_COACHES = 60;
var MAX_RECORDS = 3000;

// Die PIN liegt NICHT im Tabellenblatt, sondern in den Skript-Eigenschaften.
// So kann sie niemand auslesen, selbst wenn die Google-Tabelle geteilt wird.
var PIN_KEY = 'APP_PIN';
var APIN_KEY = 'ADMIN_PIN';

/* ============================ Anfragen ============================ */

function doGet(e) {
  // Nur für den Funktionstest im Browser gedacht.
  return HtmlService.createHtmlOutput(
    '<p style="font:16px system-ui">Trainingspräsenz-Backend läuft. ' +
    'Diese Adresse gehört in die Datei <code>docs/config.js</code>.</p>');
}

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'too_large' });
  var p = {};
  try { p = JSON.parse(raw); } catch (err) { p = (e && e.parameter) || {}; }
  return json(handle(p));
}

function handle(p) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(LOCK_MS); } catch (err) { return { ok: false, error: 'busy' }; }
  var released = false;
  try {
    var state = readState();
    var pins = getPins(state);
    if (!pins.pin) return { ok: false, error: 'nopin' };

    if (!equalsConst(String(p.pin == null ? '' : p.pin), pins.pin)) {
      var wait = penaltyMs();
      // Schlaf NACH dem Freigeben der Sperre, damit ein Angreifer mit vielen
      // Fehlversuchen nicht die echten Trainer blockiert.
      lock.releaseLock(); released = true;
      if (wait > 0) Utilities.sleep(wait);
      return { ok: false, error: 'pin' };
    }
    clearPenalty();

    if (p.action === 'save') {
      var incoming = p.state;
      var bad = validateState(incoming);
      if (bad) return { ok: false, error: bad };
      if (Number(p.rev) !== Number(state.rev || 0)) {
        // Jemand anders war schneller - die aktuelle Fassung zurueckgeben.
        return { ok: false, error: 'conflict', state: withPins(state, pins) };
      }
      var pinBad = pinChangeError(incoming, pins);
      if (pinBad) return { ok: false, error: pinBad };
      incoming.rev = Number(state.rev || 0) + 1;
      savePins(incoming, pins);            // neue PIN ggf. in die Eigenschaften uebernehmen
      writeState(stripPins(incoming));     // im Blatt landet die PIN nie
      var myRev = incoming.rev;
      // Sperre HIER schon freigeben: der Blattaufbau ist der langsamste Teil
      // und liest "_daten" nicht neben einem laufenden Schreiben (dafuer nimmt
      // renderLatest selbst kurz die Skript-Sperre). Zu-/Absagen zeichnen nur
      // "Trainerplanung" (render: "planning"); alles andere den vollen Satz.
      // "none" laesst die Blaetter bewusst unveraendert.
      var mode = (p.render === 'planning' || p.render === 'none') ? p.render : 'all';
      lock.releaseLock(); released = true;
      try { renderLatest(mode); } catch (err) { /* Darstellung darf das Speichern nie verhindern */ }
      return { ok: true, rev: myRev };
    }
    return { ok: true, state: withPins(state, pins), sheetUrl: book().getUrl() };
  } catch (err) {
    return { ok: false, error: 'server', message: String(err) };
  } finally {
    if (!released) lock.releaseLock();
  }
}

/* ---- PIN sicher in den Skript-Eigenschaften halten, nicht im Blatt ---- */
function getPins(state) {
  var props = PropertiesService.getScriptProperties();
  var pin = props.getProperty(PIN_KEY);
  var admin = props.getProperty(APIN_KEY);
  var s = (state && state.settings) || {};
  // Einmalige Uebernahme aus alten Daten, die die PIN noch im Blatt hatten.
  if (pin === null) { pin = String(s.pin || ''); props.setProperty(PIN_KEY, pin); }
  if (admin === null) { admin = String(s.adminPin || ''); props.setProperty(APIN_KEY, admin); }
  return { pin: pin, admin: admin };
}
function savePins(incoming, current) {
  var props = PropertiesService.getScriptProperties();
  var s = incoming.settings || {};
  var np = (s.pin !== undefined && s.pin !== '') ? String(s.pin) : current.pin;
  var na = (s.adminPin !== undefined) ? String(s.adminPin) : current.admin;
  if (np !== current.pin) props.setProperty(PIN_KEY, np);
  if (na !== current.admin) props.setProperty(APIN_KEY, na);
}
// Ein neuer App-PIN muss aus mindestens vier Ziffern bestehen. Leer lassen
// behaelt den bisherigen PIN (kein oeffentlicher Zugriff ohne PIN). Der
// bestehende Wert darf auch kuerzer sein, damit eine aeltere Einrichtung
// weiterhin speichern kann.
function pinChangeError(incoming, current) {
  var s = (incoming && incoming.settings) || {};
  if (s.pin === undefined || String(s.pin) === '') return null;
  var next = String(s.pin);
  if (next === String(current.pin || '')) return null;
  if (!/^[0-9]{4,16}$/.test(next)) return 'bad_pin';
  return null;
}
function stripPins(state) {
  var c = JSON.parse(JSON.stringify(state));
  if (c.settings) { c.settings.pin = ''; c.settings.adminPin = ''; }
  return c;
}
function withPins(state, pins) {
  if (state.settings) { state.settings.pin = pins.pin; state.settings.adminPin = pins.admin; }
  return state;
}

/* ---- Eingehende Daten grob pruefen ---- */
function validateState(s) {
  if (!s || typeof s !== 'object' || !s.settings || typeof s.settings !== 'object') return 'bad_state';
  var keys = ['coaches', 'players', 'rules', 'singles', 'records', 'venues', 'callups'];
  for (var i = 0; i < keys.length; i++) if (!Array.isArray(s[keys[i]])) return 'bad_state';
  if (s.players.length > MAX_PLAYERS || s.coaches.length > MAX_COACHES || s.records.length > MAX_RECORDS) return 'too_large';
  return null;
}

/* ---- Zeitkonstanter Vergleich, damit die Antwortzeit die PIN nicht verraet ---- */
function equalsConst(a, b) {
  a = String(a); b = String(b);
  var n = Math.max(a.length, b.length);
  var diff = a.length ^ b.length;
  for (var i = 0; i < n; i++) diff |= ((a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0));
  return diff === 0;
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
var FAIL_MAX_SLEEP = 20000;

// Liefert die Wartezeit fuer diesen Fehlversuch und zaehlt den Zaehler hoch.
// Der Schlaf selbst passiert im Aufrufer - ausserhalb der Sperre.
function penaltyMs() {
  var props = PropertiesService.getScriptProperties();
  var since = Number(props.getProperty(FAIL_TIME) || 0);
  var now = new Date().getTime();
  var n = (now - since > FAIL_WINDOW_MS) ? 0 : Number(props.getProperty(FAIL_KEY) || 0);
  n++;
  props.setProperty(FAIL_KEY, String(n));
  props.setProperty(FAIL_TIME, String(now));
  // Erster Fehlversuch frei, danach rasch steigend bis zum Deckel.
  return Math.min(FAIL_MAX_SLEEP, Math.max(0, (n - 1) * 1500));
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

function hideQuiet(sh) {
  try { sh.hideSheet(); } catch (err) {}
}

function dataSheet() {
  var sh = book().getSheetByName(DATA_SHEET);
  if (sh) return sh;
  // Abbruch zwischen Loeschen und Umbenennen: der neue Stand liegt noch unter dem Zwischennamen.
  var neu = book().getSheetByName(DATA_SHEET_NEXT);
  if (neu) {
    neu.setName(DATA_SHEET);
    hideQuiet(neu);
    return neu;
  }
  sh = book().insertSheet(DATA_SHEET);
  hideQuiet(sh);
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

// Schreibt zuerst vollstaendig nach _daten_neu und tauscht erst danach.
// Schlaegt setValues fehl, bleibt _daten unangetastet.
function writeState(state) {
  var raw = JSON.stringify(state);
  var parts = [];
  for (var i = 0; i < raw.length; i += CHUNK) parts.push([raw.substr(i, CHUNK)]);
  if (!parts.length) parts = [['']];
  var tmp = book().getSheetByName(DATA_SHEET_NEXT);
  if (!tmp) tmp = book().insertSheet(DATA_SHEET_NEXT);
  else tmp.clear();
  tmp.getRange(1, 1, parts.length, 1).setValues(parts);
  var cur = book().getSheetByName(DATA_SHEET);
  if (cur && cur.getSheetId() !== tmp.getSheetId()) book().deleteSheet(cur);
  tmp.setName(DATA_SHEET);
  hideQuiet(tmp);
}

// Kurzer Lesezugriff unter der Skript-Sperre, damit der Blattaufbau keinen
// halb getauschten Bestand sieht. Die Sperre wird vor dem langsamen Zeichnen
// wieder freigegeben.
function readConsistent() {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_MS);
  try { return readState(); }
  finally { lock.releaseLock(); }
}

// Zeichnet die Blaetter zum juengsten gespeicherten Stand. Die Dokument-Sperre
// reiht Aufbauten hintereinander; jeder Aufbau liest am Anfang neu. Aendert
// sich die Revision waehrend des Zeichnens, wird der nun juengste Stand einmal
// vollstaendig nachgezogen, bevor die Sperre frei wird.
function renderLatest(mode) {
  if (mode === 'none') return;
  var dlock = null, locked = false;
  try { dlock = LockService.getDocumentLock(); } catch (err) { dlock = null; }
  if (dlock) {
    try { dlock.waitLock(LOCK_MS); locked = true; } catch (err2) { locked = false; }
  }
  try {
    var state = readConsistent();
    drawState(state, mode);
    var after = readConsistent();
    if (Number(after.rev || 0) !== Number(state.rev || 0)) drawState(after, 'all');
  } finally {
    if (locked) dlock.releaseLock();
  }
}

function drawState(state, mode) {
  if (mode === 'planning') renderPlanningSheet(state);
  else renderSheets(state);
}

function removeSheet(name) {
  var sh = book().getSheetByName(name);
  if (!sh) return;
  try {
    if (book().getSheets().length <= 1) return;
    book().deleteSheet(sh);
  } catch (err) {}
}

/* ============================ Lesbare Blätter ============================ */

var DOW = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
var ST = { present: 'A', late: 'V', excused: 'E', absent: 'F', na: 'NA' };

function sheetNamed(name) {
  var sh = book().getSheetByName(name);
  if (!sh) sh = book().insertSheet(name);
  sh.clear();
  return sh;
}

// Werte, die mit = + - @ (oder Steuerzeichen) beginnen, koennte Google Sheets
// als Formel ausfuehren. Als Text erzwingen, damit ein Name wie "=IMPORTXML(..)"
// harmlos bleibt.
function cell(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}
function put(sh, rows, headerRows) {
  if (!rows.length) return;
  var width = 0;
  rows.forEach(function (r) { width = Math.max(width, r.length); });
  rows.forEach(function (r) { while (r.length < width) r.push(''); });
  var safe = rows.map(function (r) { return r.map(cell); });
  sh.getRange(1, 1, rows.length, width).setValues(safe);
  var h = headerRows || 1;
  sh.getRange(1, 1, h, width).setFontWeight('bold');
  sh.setFrozenRows(h);
}

function nameOf(p) { return ((p.first || '') + ' ' + (p.last || '')).trim(); }

function byLast(a, b) {
  var x = ((a.last || '') + ' ' + (a.first || '')).trim();
  var y = ((b.last || '') + ' ' + (b.first || '')).trim();
  return x.localeCompare(y, 'de', { sensitivity: 'base' });
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

/**
 * Loest eine Termin-ID wieder zu Datum/Art/Bezeichnung auf. Termin-IDs kommen
 * in drei Formen vor (siehe DEVELOPMENT.md):
 *  - "<ruleId>|<Datum>"  aus einer woechentlichen Serie
 *  - "<singleId>"        ein Einzeltermin, ID = state.singles[].id
 *  - dieselbe ID kann auch bereits als state.records[].id existieren, wenn
 *    die Anwesenheit fuer diesen Termin schon erfasst wurde
 * Gibt null zurueck, wenn der Termin (Serie/Einzeltermin) geloescht wurde.
 */
function occInfo(state, occId) {
  var i;
  for (i = 0; i < state.records.length; i++) {
    if (state.records[i].id === occId) {
      var r = state.records[i];
      return { date: r.date, type: r.type, label: r.label, time: r.time, timeEnd: r.timeEnd };
    }
  }
  for (i = 0; i < state.singles.length; i++) {
    if (state.singles[i].id === occId) {
      var s = state.singles[i];
      return { date: s.date, type: s.type, label: s.label, time: s.time, timeEnd: s.timeEnd };
    }
  }
  var pipe = occId.indexOf('|');
  if (pipe > 0) {
    var ruleId = occId.substring(0, pipe), date = occId.substring(pipe + 1);
    for (i = 0; i < state.rules.length; i++) {
      if (state.rules[i].id === ruleId) {
        var ru = state.rules[i];
        return { date: date, type: ru.type, label: ru.label, time: ru.time, timeEnd: ru.timeEnd };
      }
    }
  }
  return null;
}

// "na" zaehlt weder als anwesend noch als erfasst - gleiche Regel wie die
// Spielerquote. Unbekannte Werte bleiben aussen vor.
function sessionCounts(entries) {
  var here = 0, tot = 0;
  for (var k in (entries || {})) {
    var v = entries[k];
    if (v === 'na') continue;
    if (v !== 'present' && v !== 'late' && v !== 'excused' && v !== 'absent') continue;
    tot++;
    if (v === 'present' || v === 'late') here++;
  }
  return { here: here, tot: tot };
}

function renderPlanningSheet(state) {
  var avail = state.availability || {};
  var occIds = Object.keys(avail).sort(function (a, b) {
    var ia = occInfo(state, a), ib = occInfo(state, b);
    var da = ia ? ia.date : '9999', db = ib ? ib.date : '9999';
    if (da !== db) return da < db ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (!occIds.length) { removeSheet('Trainerplanung'); return; }
  var sh = sheetNamed('Trainerplanung');
  var coaches = state.coaches.slice().sort(byLast);
  var rows = [['Datum', 'Wochentag', 'Art', 'Bezeichnung'].concat(
    coaches.map(function (c) { return nameOf(c); }))];
  occIds.forEach(function (occId) {
    var info = occInfo(state, occId);
    if (!info) return;
    var row = [fmtDay(info.date), weekdayOf(info.date), info.type === 'match' ? 'Wettkampf' : 'Training', info.label || ''];
    coaches.forEach(function (c) {
      var a = avail[occId] && avail[occId][c.id];
      if (!a || !a.status || a.status === 'pending') row.push('Ausstehend');
      else if (a.status === 'confirmed') row.push('Verfügbar');
      else if (a.status === 'uncertain') row.push('Ungewiss');
      else if (a.status === 'declined') row.push('Nicht verfügbar' + (a.reason ? ' (' + a.reason + ')' : ''));
      else row.push('');
    });
    rows.push(row);
  });
  if (rows.length < 2) { removeSheet('Trainerplanung'); return; }
  put(sh, rows);
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
  rows = [['Nachname', 'Vorname', 'Funktion', 'Status', 'Einsätze', 'Erfasste Termine', 'Quote']];
  state.coaches.slice().sort(byLast).forEach(function (c) {
    var n = 0;
    recs.forEach(function (r) { if ((r.coachIds || []).indexOf(c.id) >= 0) n++; });
    rows.push([c.last || '', c.first || '', c.role || '', c.active === false ? 'inaktiv' : 'aktiv', n, recs.length,
      recs.length ? n / recs.length : '']);
  });
  put(sh, rows);
  if (state.coaches.length) sh.getRange(2, 7, state.coaches.length, 1).setNumberFormat('0%');

  // --- Trainer-Planung (Zu-/Absagen) ---
  // Zeigt nur Termine, zu denen mindestens eine Antwort vorliegt. Ohne Antwort
  // wird ein frueheres Blatt entfernt, damit keine veralteten Zeilen stehen bleiben.
  renderPlanningSheet(state);

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
    var sc = sessionCounts(r.entries);
    rows.push([fmtDay(r.date), weekdayOf(r.date), r.time || '', r.timeEnd || '',
      r.type === 'match' ? 'Wettkampf' : 'Training', r.label || '', coachNames(state, r.coachIds),
      sc.here, sc.tot, sc.tot ? sc.here / sc.tot : '', r.note || '']);
  });
  put(sh, rows);
  if (recs.length) sh.getRange(2, 10, recs.length, 1).setNumberFormat('0%');

  // --- Aufgebote ---
  if (!(state.callups || []).length) removeSheet('Aufgebote');
  if ((state.callups || []).length) {
    sh = sheetNamed('Aufgebote');
    var singlesById = {};
    state.singles.forEach(function (m) { singlesById[m.id] = m; });
    var playersById = {};
    players.forEach(function (p) { playersById[p.id] = p; });
    var coachesById = {};
    state.coaches.forEach(function (c) { coachesById[c.id] = c; });
    rows = [['Datum', 'Gegner', 'Heim/Auswärts', 'Besammlungszeit', 'Besammlungsort', 'Trainer', 'Spieler', 'Anzahl']];
    state.callups.slice().sort(function (a, b) {
      var ma = singlesById[a.matchId], mb = singlesById[b.matchId];
      var da = ma ? ma.date : '', dbb = mb ? mb.date : '';
      return da < dbb ? -1 : da > dbb ? 1 : 0;
    }).forEach(function (cu) {
      var m = singlesById[cu.matchId];
      if (!m) return; // Wettkampftag wurde inzwischen geloescht
      var names = [];
      var coachN;
      if (cu.squads) {
        (cu.squads || []).forEach(function (sq) {
          var sqKeepers = sq.keeperIds || (sq.keeperId ? [sq.keeperId] : []);
          (sq.playerIds || []).forEach(function (pid) {
            var p = playersById[pid]; if (!p) return;
            names.push(nameOf(p) + (sqKeepers.indexOf(pid) >= 0 ? ' (TW)' : '') + (sq.captainId === pid ? ' (Captain)' : '') + ' [' + (sq.name || '') + ']');
          });
        });
        coachN = (cu.squads || []).map(function (sq) {
          var n = (sq.coachIds || []).map(function (cid) { var c = coachesById[cid]; return c ? nameOf(c) : null; }).filter(Boolean).join(', ');
          return (sq.name || '') + ': ' + n;
        }).join(' / ');
      } else {
        var cuKeepers = cu.keeperIds || (cu.keeperId ? [cu.keeperId] : []);
        names = (cu.playerIds || []).map(function (pid) {
          var p = playersById[pid]; if (!p) return null;
          return nameOf(p) + (cuKeepers.indexOf(pid) >= 0 ? ' (TW)' : '') + (cu.captainId === pid ? ' (Captain)' : '');
        }).filter(Boolean);
        coachN = (cu.coachIds || []).map(function (cid) { var c = coachesById[cid]; return c ? nameOf(c) : null; }).filter(Boolean).join(', ');
      }
      (cu.guests || []).forEach(function (g) { names.push((g.name || '') + (g.team ? ' (' + g.team + ')' : '')); });
      rows.push([fmtDay(m.date), m.opponent || '', cu.squads ? 'Turnier' : (m.homeAway === 'home' ? 'Heim' : 'Auswärts'),
        cu.meetTime || '', cu.meetPlace || '', coachN, names.join(', '), names.length]);
    });
    if (rows.length < 2) removeSheet('Aufgebote');
    else put(sh, rows);
  }

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
    ['NA', 'nicht im Aufgebot (nur bei Wettkämpfen) - zählt nicht in die Quote hinein, reine Information'],
    ['(W)', 'Wettkampf statt Training'],
    ['', ''],
    ['Quote (Kader)', '(anwesend + verspätet) geteilt durch die erfassten Termine des Spielers'],
    ['Quote (Trainer)', 'Einsätze geteilt durch alle erfassten Termine - Blatt "Trainer", für die Spesenabrechnung'],
    ['', ''],
    ['Trainerplanung', 'zeigt nur Termine, zu denen mindestens ein Trainer bereits zu- oder abgesagt hat'],
    ['Aufgebote', 'zeigt nur Wettkampftage, für die bereits ein Aufgebot erstellt wurde'],
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
    records: [],
    venues: [],
    callups: []
  };
}
