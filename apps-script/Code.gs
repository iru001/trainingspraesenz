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
      incoming.rev = Number(state.rev || 0) + 1;
      savePins(incoming, pins);            // neue PIN ggf. in die Eigenschaften uebernehmen
      writeState(stripPins(incoming));     // im Blatt landet die PIN nie
      // Sperre HIER schon freigeben: renderSheets() schreibt mehrere lesbare
      // Blaetter (Kader/Trainer/Auswertung/Termine/Aufgebote/Matrix/Legende)
      // und ist dadurch der mit Abstand langsamste Teil einer Speicherung.
      // Liefe das noch innerhalb der Sperre, wuerde es jede andere Anfrage
      // (auch ein simples Einloggen/"load") fuer die gesamte Dauer blockieren -
      // obwohl renderSheets() nie von readState() gelesen wird (das liest nur
      // das Blatt "_daten", welches an dieser Stelle bereits sicher geschrieben
      // ist). Die eigentlich schuetzenswerte Operation (writeState) ist hier
      // bereits abgeschlossen.
      lock.releaseLock(); released = true;
      try { renderSheets(incoming); } catch (err) { /* Darstellung darf das Speichern nie verhindern */ }
      return { ok: true, rev: incoming.rev };
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
  // Zeigt nur Termine, zu denen mindestens eine Antwort vorliegt (Object.keys
  // von state.availability) - Termine ganz ohne Antwort tauchen hier bewusst
  // nicht auf, damit das Blatt nicht mit weit in der Zukunft liegenden,
  // unbeantworteten Terminen ueberladen wird.
  var avail = state.availability || {};
  var occIds = Object.keys(avail).sort();
  if (occIds.length) {
    sh = sheetNamed('Trainerplanung');
    var coaches = state.coaches.slice().sort(byLast);
    var head2 = ['Datum', 'Wochentag', 'Art', 'Bezeichnung'].concat(
      coaches.map(function (c) { return nameOf(c); }));
    rows = [head2];
    occIds.forEach(function (occId) {
      var info = occInfo(state, occId);
      if (!info) return; // Termin (Serie/Einzeltermin) wurde inzwischen geloescht
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
    put(sh, rows);
  }

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

  // --- Aufgebote ---
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
          (sq.playerIds || []).forEach(function (pid) {
            var p = playersById[pid]; if (!p) return;
            names.push(nameOf(p) + (sq.keeperId === pid ? ' (TW)' : '') + ' [' + (sq.name || '') + ']');
          });
        });
        coachN = (cu.squads || []).map(function (sq) {
          var n = (sq.coachIds || []).map(function (cid) { var c = coachesById[cid]; return c ? nameOf(c) : null; }).filter(Boolean).join(', ');
          return (sq.name || '') + ': ' + n;
        }).join(' / ');
      } else {
        names = (cu.playerIds || []).map(function (pid) {
          var p = playersById[pid]; if (!p) return null;
          return nameOf(p) + (cu.keeperId === pid ? ' (TW)' : '');
        }).filter(Boolean);
        coachN = (cu.coachIds || []).map(function (cid) { var c = coachesById[cid]; return c ? nameOf(c) : null; }).filter(Boolean).join(', ');
      }
      (cu.guests || []).forEach(function (g) { names.push((g.name || '') + (g.team ? ' (' + g.team + ')' : '')); });
      rows.push([fmtDay(m.date), m.opponent || '', cu.squads ? 'Turnier' : (m.homeAway === 'home' ? 'Heim' : 'Auswärts'),
        cu.meetTime || '', cu.meetPlace || '', coachN, names.join(', '), names.length]);
    });
    put(sh, rows);
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
