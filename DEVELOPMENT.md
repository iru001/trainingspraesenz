# Entwickler-Dokumentation – Trainingspräsenz

Diese Datei richtet sich an Entwickler:innen (Mensch oder KI), die an der App
weiterarbeiten. Sie beschreibt Zweck, Architektur, Datenmodell, die
Schnittstelle zwischen App und Server, die Sicherheitsentscheidungen und die
Arbeitsweise inklusive Tests. Wer nur die App *betreiben* will, braucht statt
dieser Datei die [SETUP.md](SETUP.md).

> **Golden Rules – bitte zuerst lesen**
> 1. **Kein Build-Schritt, keine Abhängigkeiten, kein Framework.** Die App ist
>    eine einzige statische HTML-Datei mit Vanilla-JavaScript (ES5-Stil,
>    `var`/`function`). Das bleibt so. Kein npm-Paket im Auslieferungsstand,
>    kein React, kein TypeScript, kein Transpiler.
> 2. **Zwei Laufzeiten, zwei Deploy-Wege.** `docs/` läuft im Browser (GitHub
>    Pages, automatisch bei Push). `apps-script/Code.gs` läuft in Google Apps
>    Script und muss **manuell neu bereitgestellt** werden (siehe unten).
>    Eine Änderung an `Code.gs` im Repo ist erst nach Redeploy wirksam.
> 3. **Keine Personendaten und keine PIN ins Repository.** Das Repo ist
>    öffentlich. Namen und PINs leben ausschliesslich in der Google-Tabelle
>    bzw. den Skript-Eigenschaften des Betreibers.
> 4. **Datensparsamkeit ist Feature, nicht Zufall.** Zu Spielern werden nur
>    Vorname und abgekürzter Nachname gespeichert – keine Geburtsdaten,
>    Adressen, Kontaktdaten. Neue Felder mit Personenbezug nur nach Rücksprache.
> 5. **Deutschsprachig.** UI-Texte, Commit-Messages und Kommentare auf Deutsch.

---

## 1. Was die App tut

Anwesenheitserfassung für eine Kinder-/Jugend-Fussballmannschaft. Trainer
erfassen pro Training oder Wettkampf, welche Spieler anwesend/verspätet/
entschuldigt/fehlend waren und welche Trainer geleitet haben. Auswertung zeigt
die Anwesenheitsquote je Spieler über die Saison. Läuft auf jedem Smartphone im
Browser, ohne Installation und ohne Benutzerkonto; Zugang nur über einen PIN.

**Nutzerrollen:** Es gibt technisch nur eine Rolle – „wer den App-PIN kennt".
Der Admin-PIN ist eine reine Bequemlichkeitssperre gegen versehentliche
Änderungen, **kein** Sicherheits- oder Rechte-Konzept (siehe §7).

---

## 2. Architektur auf einen Blick

```
┌─────────────────────────┐        HTTPS POST (JSON)        ┌────────────────────────┐
│  Browser (Smartphone)   │  ───────────────────────────▶  │  Google Apps Script    │
│  docs/index.html        │   {action, pin, rev, state}     │  apps-script/Code.gs   │
│  – gesamte UI + Logik   │  ◀───────────────────────────   │  – PIN-Prüfung         │
│  docs/config.js:        │        JSON {ok, state|rev}     │  – Lese/Schreibe Sheet │
│    apiUrl → Skript       │                                 │  – rendert Blätter     │
└─────────────────────────┘                                 └───────────┬────────────┘
        ▲                                                                │
        │ statisch ausgeliefert                                          ▼
   GitHub Pages (Branch main, Ordner /docs)              Google-Tabelle (Drive des Betreibers)
                                                          – _daten (ausgeblendet, JSON-Zustand)
                                                          – Kader/Trainer/Auswertung/… (Anzeige)
                                                          Skript-Eigenschaften: APP_PIN, ADMIN_PIN
```

- **Frontend** (`docs/index.html`): eine Datei, die alles enthält – CSS im
  `<style id="app-style">`, die gesamte Logik im `<script id="app-code">`. Der
  Zustand wird nach der Team- und PIN-Wahl einmal vom Server geladen und im
  Speicher gehalten (`DB`). Jede Änderung schickt den **kompletten** Zustand
  des aktuell gewählten Teams zurück. Die Google-Fonts-`<link
  rel="stylesheet">` im `<head>` lädt bewusst **nicht blockierend**
  (`media="print" onload="this.media='all'"`, `<noscript>`-Fallback): eine
  normale `<link rel=stylesheet>` vor den `<script>`-Tags würde deren
  Ausführung anhalten, bis die Schrift antwortet – bei langsamem/blockiertem
  Netz (Firmen-WLAN, Ad-Blocker, Google-Ausfall) bliebe die Seite sonst
  minuten­lang weiss, statt sofort mit Systemschrift zu erscheinen.
- **Konfiguration** (`docs/config.js`): setzt `window.TP_CONFIG.teams` – eine
  Liste von Teams, jedes mit eigener `apiUrl`. Einzige betreiberspezifische
  Datei. Siehe §3a.
- **Backend** (`apps-script/Code.gs`): dünne Schicht über einer Google-Tabelle.
  Prüft den PIN, liest/schreibt den JSON-Zustand in ein ausgeblendetes Blatt
  `_daten` und rendert daraus lesbare Blätter für den Excel-Export. **Kennt
  keine Teams** – jede Bereitstellung von `Code.gs` bedient genau EIN Team
  (eine Tabelle). Mehrere Teams entstehen durch mehrere unabhängige
  Bereitstellungen desselben, unveränderten Skripts. `put()` (schreibt ein
  Blatt) ruft bewusst **kein** `autoResizeColumns()` mehr auf – eine
  bekannt langsame Apps-Script-API, die bei JEDER Speicherung für JEDES Blatt
  gelaufen wäre, inklusive jedem einzelnen Trainer-Verfügbarkeits-Tipp in der
  Planung (`commitAvailability`).
- **Persistenz**: die „Datenbank" ist eine Google-Tabelle. Der maßgebliche
  Zustand liegt als **ein** JSON-String im Blatt `_daten`, über mehrere Zellen
  verteilt (max. `CHUNK` Zeichen pro Zelle). Die übrigen Blätter sind ein
  **Abbild** und werden bei jeder Speicherung überschrieben.

**Bewusst NICHT vorhanden:** Benutzerkonten, Sessions/Tokens, echte Datenbank,
Server-Framework, Realtime/WebSockets, Push, mehrsprachige UI. Mandantenfähigkeit
gibt es nur auf Frontend-Ebene (§3a) – eine Backend-Bereitstellung bedient
weiterhin genau ein Team.

---

## 3. Dateien im Repository

| Pfad | Zweck | Deploy |
|---|---|---|
| `docs/index.html` | Komplette App (UI, Logik, Styles) – **team-unabhängig** | GitHub Pages, automatisch |
| `docs/config.js` | Liste der Teams, je mit eigener `apiUrl` | GitHub Pages, automatisch |
| `docs/icon.svg` | App-Symbol (Startbildschirm) | GitHub Pages, automatisch |
| `docs/manifest.webmanifest` | PWA-Manifest | GitHub Pages, automatisch |
| `docs/.nojekyll` | verhindert Jekyll-Verarbeitung | – |
| `apps-script/Code.gs` | Backend, **einmal pro Team bereitgestellt** | **manuell** in Apps Script + Redeploy, pro Team |
| `SETUP.md` | Einrichtung für Betreiber | – |
| `README.md` | Überblick | – |
| `DEVELOPMENT.md` | dieses Dokument | – |

---

## 3a. Mehrere Teams

Eine Bereitstellung der App (ein GitHub-Pages-Link) kann mehrere, komplett
unabhängige Teams bedienen. "Unabhängig" heisst wörtlich: eigene
Google-Tabelle, eigenes `Code.gs`-Deployment, eigener PIN, eigener Admin-PIN,
eigene Trainer/Spieler/Termine – nichts wird zwischen Teams geteilt ausser der
Programmoberfläche selbst. Das Backend weiss nichts von "mehreren Teams"; es
bedient wie eh und je genau eine Tabelle. Die Trennung passiert ausschliesslich
im Frontend.

**`docs/config.js`:**
```js
window.TP_CONFIG = {
  teams: [
    { id: "fa2018", name: "FA 2018", apiUrl: "https://script.google.com/.../exec" },
    { id: "db",     name: "Db",      apiUrl: "https://script.google.com/.../exec",
      logo: "data:image/png;base64,…" }   // optional, siehe Abschnitt 4a
  ]
};
```
`id` ist ein fester, kurzer Code (keine Sonderzeichen) – er ist Teil von
`localStorage`-Schlüsseln und darf sich nach dem Ausrollen nicht mehr ändern,
sonst "vergisst" jedes Gerät seinen gemerkten PIN für dieses Team. Ist nur ein
Team konfiguriert, wird die Team-Auswahl automatisch übersprungen. `logo` ist
optional und erscheint nur auf dem Aufgebot (Abschnitt 4a) – bewusst hier statt
im Datenbestand, da es sich praktisch nie ändert und sonst bei jeder Anfrage
mitübertragen würde.

**Ablauf im Frontend:** `TEAM` (gewähltes Team-Objekt) ist ein zusätzlicher
globaler Zustand VOR `DB`. Ist `TEAM` noch `null`, zeigt `render()` den
Team-Picker (`viewTeamPicker()`); erst danach greift die normale
PIN-Sperre (`viewLock("app")`), diesmal gegen `TEAM.apiUrl` statt eine feste
Adresse. `apiCall()`/`configured()` lesen `TEAM.apiUrl`, nicht mehr `CFG.apiUrl`.

**Wichtig – geräteweise gemerkte Werte sind pro Team eigene Schlüssel**, sonst
könnte auf einem Gerät der PIN oder die "wer bin ich"-Auswahl des einen Teams
versehentlich beim anderen landen (unabhängige Tabellen können z. B. beide
einen Trainer mit der ID `c1` haben – ohne Trennung würde ein falscher Name
vorausgewählt):
- `localStorage.tp.team` – zuletzt gewähltes Team (team-übergreifend, genau
  ein Schlüssel).
- `localStorage.tp.pin.<teamId>` – App-PIN je Team (ersetzt das frühere,
  flache `tp.pin`).
- `sessionStorage.tp.admin.<teamId>` – Admin-PIN je Team (ersetzt `tp.admin`).
- `localStorage.tp.coach.<teamId>` – gewählter Trainer in der Planung je Team
  (ersetzt `tp.coach`).

Beim Abmelden (`ACT.lock`) oder Teamwechsel (`ACT.changeteam`) wird `UI`
komplett zurückgesetzt (nicht nur `TEAM`/`DB`), damit keine Termin-ID des
vorigen Teams als `UI.occ`/`UI.planOcc` hängen bleibt.

**Ein weiteres Team hinzufügen:** siehe SETUP.md, Abschnitt „Weiteres Team
hinzufügen" – im Kern: Google-Tabelle + `Code.gs`-Bereitstellung wie beim
ersten Team (Code.gs bleibt dabei **unverändert**, nur `ERSTER_PIN` ist neu),
dann einen Eintrag in `docs/config.js`s `teams`-Feld ergänzen.

---

## 4. Datenmodell (State)

Der gesamte Anwendungszustand ist ein JSON-Objekt. Es ist das, was zwischen App
und Server hin- und herwandert und was in `_daten` liegt.

```jsonc
{
  "v": 1,                    // Schema-Version
  "rev": 11,                 // Revision, +1 pro Speicherung (Konfliktschutz)
  "settings": {
    "team": "Beispielteam",
    "season": "2026/27",
    "seasonStart": "2026-08-01",   // ISO-Datum (YYYY-MM-DD)
    "seasonEnd":   "2027-06-30",
    "pin": "••••••",         // NUR client-/transportseitig; im Blatt immer ""
    "adminPin": "••••",      //   (Quelle der Wahrheit: Skript-Eigenschaften)
    "callupNotes": "",       // Aufgebot: Text unter "Mitnehmen", leer = Standardtext
    "callupCancelHint": "",  // Aufgebot: Text unter "Abmeldungen/Verspätungen", leer = Standardtext
    "callupMode": "match",   // "match" (ein Gegner) oder "tournament" (1-2 Teams), siehe Abschnitt 4a
    "awayMeetPlace": ""      // Aufgebot: fixer Treffpunkt auswärts/Turnier, leer = "Militärparkplatz Bülach"
  },
  "coaches": [
    { "id": "c1", "first": "Max", "last": "M.", "role": "Trainer", "active": true }
  ],
  "players": [
    { "id": "p1", "first": "Luca", "last": "B.", "active": true }
  ],
  "rules": [                 // wöchentlich wiederkehrende Termine (Serien)
    { "id": "r-ab12cd", "type": "training", "weekday": 2, "time": "18:00",
      "timeEnd": "19:30", "label": "Haupttraining",
      "from": "2026-08-18", "to": "2027-06-30", "active": true,
      "duringHolidays": false }   // optional, fehlt = false, siehe unten
  ],
  "singles": [               // Einzeltermine (z. B. Turniere, Meisterschaftsspiele)
    { "id": "s1", "type": "match", "date": "2026-08-22", "time": "12:00",
      "timeEnd": "16:00", "label": "PMF-Turnier …",
      "opponent": "FC Muster c", "homeAway": "away",       // nur bei type "match" genutzt
      "venueAddress": "Sportanlage Buhwil, Effretikon" }   // siehe Aufgebot, Abschnitt 4a
  ],
  "records": [               // abgeschlossene Erfassungen
    { "id": "r-ab12cd|2026-08-18",   // = Termin-ID (siehe unten)
      "date": "2026-08-18", "time": "18:00", "timeEnd": "19:30",
      "type": "training", "label": "Haupttraining",
      "coachIds": ["c1", "c4"],
      "entries": { "p1": "present", "p3": "absent", "p5": "late", "p7": "excused" },
      "note": "",
      "createdAt": "Di 18.08.26 22:51", "createdBy": "Max M., …",
      "updatedAt": "Di 18.08.26 22:51", "updatedBy": "Max M., …" }
  ],
  "availability": {           // Zu-/Absagen der Trainer (Trainer-Planung)
    // Schlüssel = dieselbe Termin-ID wie bei records; nur EXPLIZITE Antworten
    // werden gespeichert - fehlt ein Trainer hier, gilt er als "pending".
    "r-ab12cd|2026-08-24": {
      "c1": { "status": "confirmed" },
      "c4": { "status": "declined", "reason": "Ferien" }
    }
  },
  "venues": [                 // Fahrzeit ab Bülach, einmalig pro Sportplatz-Adresse
    { "address": "Sportanlage Buhwil, Effretikon", "travelMinutes": 25 }
  ],
  "callups": [                 // Aufgebote, siehe Abschnitt 4a
    { "id": "cu-ab12cd", "matchId": "s1",           // Form bei callupMode "match"
      "meetTime": "08:35", "meetPlace": "Militärparkplatz Bülach", "travelMinutes": 25,
      "coachIds": ["c1", "c4"], "playerIds": ["p1", "p2", "…"], "keeperId": "p1",
      "guests": [{ "name": "Arel", "team": "D9c" }],
      "rows": [                                     // Reihenfolge/Auswahl der Infotabelle im Ausdruck
        { "key": "notcalled", "kind": "auto" }, { "key": "wann", "kind": "auto" },
        { "key": "meettime", "kind": "field" }, { "key": "meetplace", "kind": "field" },
        { "key": "duration", "kind": "auto" }, { "key": "addr", "kind": "field" },
        { "key": "mitnehmen", "kind": "team" },
        { "key": "row-x1y2z3", "kind": "custom", "label": "Verpflegung", "value": "Banane, Riegel" }
      ] },
    { "id": "cu-ef34gh", "matchId": "s2",           // Form bei callupMode "tournament"
      "meetTime": "08:45", "meetPlace": "Militärparkplatz beim Sportplatz Erachfeld", "travelMinutes": 15,
      "squads": [
        { "name": "Team A", "coachIds": ["c1"], "playerIds": ["p1", "…"], "keeperId": "p1" },
        { "name": "Team B", "coachIds": ["c2"], "playerIds": ["p7", "…"], "keeperId": "" }
      ],
      "guests": [] }
  ]
}
```

**Konventionen und Invarianten**

- **IDs**: `uid(prefix)` erzeugt `prefix-<zufall><zeit>`. Präfixe: `p` Spieler,
  `c` Trainer, `r` Serie, `s` Einzeltermin, `x` Ad-hoc-Termin. IDs sind stabil
  und werden nie wiederverwendet.
- **Termin-ID (occurrence id)**: Eine Serie erzeugt konkrete Termine. Deren ID
  ist `"<ruleId>|<ISO-Datum>"`. Einzeltermine und Ad-hoc-Termine nutzen ihre
  eigene ID direkt. Ein `record.id` **ist** die Termin-ID – dadurch ist jede
  Erfassung eindeutig einem Termin zugeordnet und mehrfaches Speichern
  aktualisiert denselben Datensatz statt Duplikate zu erzeugen.
- **Status-Werte** in `entries`: `"present" | "late" | "excused" | "absent"`
  (UI-Kürzel A/V/E/F) sowie zusätzlich `"na"` (**N**icht im **A**ufgebot,
  UI-Kürzel „NA"), das aber **kein** fünfter gleichwertiger Status ist – siehe
  eigener Punkt unten. Ein Spieler ohne Eintrag zählt für diesen Termin
  **nicht** in die Statistik.
- **Quote** = (`present` + `late`) / Anzahl Termine mit Eintrag (`"na"` zählt
  dabei wie "kein Eintrag" NICHT mit, siehe unten). Zentral in `playerStats()`;
  wer die Definition ändert, muss Backend-`renderSheets` und den Bericht
  anpassen.
- **`"na"` (Nicht im Aufgebot)**: nur bei `type === "match"` wählbar (Button
  erscheint in `viewRecord()` nur dort, `.seg.seg-5` statt `.seg` für die
  fünfte Spalte). Bewusst **kein** Eintrag in `STATUS`/`SK` – dort würde er
  automatisch in jede Quote-Leiste, jede A/V/E/F-Spalte im Bericht und jede
  Auswertungsspalte einfließen, obwohl er ausdrücklich neutral/informativ
  bleiben soll ("nicht negativ, nur Info"). Stattdessen:
  - `playerStats()`/Backend-`renderSheets()` zählen ihn implizit nicht mit,
    weil ihre Zähler-Objekte keinen `na`-Schlüssel haben (derselbe Mechanismus
    wie bei einem fehlenden Eintrag).
  - `abFor(status)` ist die sichere Lookup-Funktion für Matrix-Zellen
    (Frontend `exportCsv()`/`viewReport()`) – `SK[st].ab` direkt aufzurufen
    würde bei `"na"` abstürzen, da `SK` keinen `na`-Eintrag hat.
  - Backend-`ST`-Map (`apps-script/Code.gs`) hat `na: 'NA'` ergänzt, damit die
    Matrix-Tabellenblatt-Zelle „NA" statt leer zeigt.
  - `tallyHtml()` zählt `"na"` separat in `counts.na` und zeigt bei `> 0` eine
    eigene Pille „Nicht im Aufgebot"; es zählt zum "Eintrag vorhanden"-Zähler
    `set`, damit der Trainer nicht dauerhaft zum Nachtragen aufgefordert wird.
- **`type`**: `"training" | "match"`.
- **`rules[].duringHolidays`**: steuert, ob eine wöchentliche Serie auch während
  der Schulferien Termine erzeugt. Standard/fehlendes Feld = `false` (Ferien
  werden ausgelassen). Die Ferientermine selbst sind fest als `HOLIDAYS_BUELACH`
  (Array von `{from, to}`-ISO-Zeiträumen) im Frontend hinterlegt und werden in
  `plannedOccurrences()` geprüft (`isSchoolHoliday()`); `singles` sind davon
  nicht betroffen – Einzeltermine finden immer statt, unabhängig von Ferien.
  Weitere Kantone/Gemeinden würden eine zweite Liste plus Auswahl in den
  Team-Einstellungen brauchen, aktuell ist nur Bülach hinterlegt.
- **Status-Werte** in `availability[occId][coachId].status`: genau
  `"confirmed" | "uncertain" | "declined"` (UI: 👍 Verfügbar / ❓ Ungewiss /
  👎 Nicht verfügbar), `reason` (optional, Freitext) nur bei `"declined"`
  relevant. Fehlt der Eintrag ganz, gilt der Trainer als `"pending"`
  (⏳ Ausstehend) – dieser Wert wird nie explizit gespeichert.
- **`availability`** ist bewusst sparse (kein Eintrag = `pending`), analog zu
  `entries` bei den Spielern. **Es gibt keine Vorab-Befüllung**: Weder beim
  Anlegen eines neuen Trainers noch beim Anlegen einer Serie/eines
  Einzeltermins werden Einträge erzeugt. Das ist eine bewusste Abweichung von
  einer naheliegenderen "bei jedem neuen Termin alle Trainer mit pending
  verknüpfen"-Idee: Termine existieren nicht als persistente Objekte (siehe
  `plannedOccurrences()` weiter unten) – eine Serie ohne Enddatum würde sonst
  unbegrenzt viele Einträge erzeugen, und jede Änderung an Trainern oder
  Terminen bräuchte einen Nachtrage-Mechanismus. Ein Eintrag entsteht nur,
  wenn ein Trainer tatsächlich antwortet; toggelt er zurück auf "pending",
  wird der Eintrag wieder gelöscht (siehe `commitAvailability()`).
- **Identität in der Planung**: `myCoachId()` liefert die pro Gerät gemerkte
  Trainer-ID (`storedCoach()`, Storage-Key `tp.coach.<teamId>`). Ist keine
  gesetzt oder verweist sie auf einen gelöschten Trainer, zeigt der Tab
  „Planung“ zuerst `viewPlanIdentity()` (Namensauswahl) statt der Übersicht
  `viewPlanning()` – siehe `render()`-Routing für `UI.view === "planning"`.
- **`active: false`** deaktiviert (pausiert) Spieler/Trainer/Serien, ohne
  Historie zu verlieren. Löschen entfernt zusätzlich Verweise in `records`.
- **Zeiten**: `time`/`timeEnd` als `"HH:MM"`; leer erlaubt (z. B. Hallenturnier
  „Vormittag"). Datumsangaben immer ISO `YYYY-MM-DD`, lokale Zeitzone.

Beim Laden läuft der Zustand durch `normalize()` (fehlende Felder/Arrays
ergänzen). **Migrationsregel-Beispiel**: `normalize` entfernt ein evtl.
vorhandenes `player.birth` – so wurde das nachträgliche Streichen der
Geburtsdaten idempotent gemacht. Neue Migrationen gehören ebenfalls hierhin.

---

## 4a. Aufgebot

Admin-Funktion, mit der ein Trainer für einen Wettkampftag ein druckbares
Spielaufgebot erstellt – Ersatz für das bisher manuell in Word gepflegte
Dokument. Zwei Team-Vorlagen, gesteuert über `settings.callupMode`:

- **`"match"`** (Default, z. B. D9b): ein Gegner, Heim/Auswärts, EIN Kader mit
  1–2 Trainern und bis zu 14 Spielern.
- **`"tournament"`** (z. B. FA 2018): kein fester Gegner (stattdessen freie
  Turnier-Bezeichnung), immer "auswärts"-artig (fixer Treffpunkt +
  Fahrzeit-Abzug), dafür ein oder zwei eigenständige Teams (`squads`), je mit
  eigenem Namen, 1–2 Trainern und beliebig vielen Spielern (kein 14er-Deckel –
  der gilt nur für `"match"`, siehe FA-Vorlage mit 6–7 Spielern pro Team).

`callupMode(cw.mode)` läuft durch die ganze Kette: `newCallupState()` liefert
je nach Modus eine flache Struktur (`coachIds`/`playerIds`/`keeperId`) oder
`squads: [{name, coachIds, playerIds, keeperId}]`; `viewCallupWizard()` zeigt
entsprechend 3 Schritte (Treffpunkt/Trainer/Spieler) oder 2
(Treffpunkt/Teams, `callupStepSquads()`); `ACT.cwsave` schreibt dieselbe Form
in `DB.callups[]`. Ein Spieler kann nicht gleichzeitig in zwei Teams gewählt
werden (Prüfung in `ACT.cwsquadplayer`, `usedElsewhere` in der Anzeige).
`newCallupState()` behandelt ein bestehendes Aufgebot der jeweils ANDEREN
Form (z. B. `squads` statt `coachIds`/`playerIds`, wenn `callupMode` nach dem
Speichern geändert wurde) defensiv wie "kein bestehendes Aufgebot" statt
`undefined.slice()` auszulösen. `opponent` (Gegner bzw. Turnier-Bezeichnung)
fällt dort auf `m.label` (die allgemeine "Bezeichnung" des Termins) zurück,
wenn kein eigener Wert gesetzt ist – bei älteren, vor der eigenen Gegner-/
Turnier-Bezeichnung-Erfassung angelegten Terminen steht diese Angabe oft nur
als Teil der Bezeichnung ("Spiel gegen FC Muster c"). Ein bearbeitbarer
Vorschlag statt eines leeren Pflichtfelds. Für `venueAddress` gibt es
dagegen bewusst KEINEN Fallback – eine Adresse lässt sich nicht sinnvoll aus
Freitext raten; die muss einmalig in "Termine" nachgetragen werden.

- **Ablauf**: `adminCallups()` listet alle `singles` mit `type === "match"`;
  Antippen ruft `ACT.callupview` auf, das je nach `callupForMatch()` entweder
  direkt `viewCallupPrint()` zeigt (Aufgebot existiert bereits – "Bearbeiten"
  dort führt via `ACT.callupopen` in den Wizard) oder `viewCallupWizard()` mit
  `UI.callup` (neuer Entwurf, nur im Speicher, nicht Teil von `DB`) öffnet.
  So reicht ein Antippen für die Vorschau, statt jedes Mal den ganzen Wizard
  durchklicken zu müssen. `ACT.cwsave` schreibt Entwurf → `DB.singles[]
  .{opponent,homeAway,venueAddress}` (`homeAway` nur bei `"match"`) und
  `DB.callups[]` in einem `commit()`, danach Sprung zu `viewCallupPrint()`
  (druckbare Ansicht, `data-act="print"` wie beim bestehenden Bericht via
  `window.print()`).
- **Treffpunkt-Vorschlag** (`proposeMeetTime()`, ausgelöst über `ACT.cwrecalc`):
  1 Stunde vor Anpfiff am Spielort; bei Auswärtsspielen (bzw. immer im
  Turnier-Modus) zusätzlich abzüglich der Fahrzeit ab Bülach, Treffpunkt dann
  fix `awayMeetPlace()` (= `settings.awayMeetPlace`, sonst Standardtext
  "Militärparkplatz Bülach") statt der Spielortadresse. Beide Vorschläge sind
  frei überschreibbar (`cw-meetplace`/`cw-meettime`). Die Neuberechnung läuft
  automatisch bei jeder Änderung von Heim/Auswärts oder der Fahrzeit (globaler
  `change`-Listener auf `#cw-ha`/`#cw-travel`, bewusst `change` statt `input`,
  damit ein Neu-Rendern nicht mitten im Tippen den Fokus verliert) – kein
  eigener "neu vorschlagen"-Button mehr nötig.
- **Fahrzeit-Wiederverwendung**: `DB.venues` speichert die Fahrzeit einmalig
  pro Adresse (`venueFor()`, Vergleich getrimmt/kleingeschrieben); `cwsave`
  legt einen Eintrag an oder aktualisiert ihn. Bewusst KEINE
  Geocoding-/Karten-API – der Trainer trägt die Minuten einmalig von Hand ein.
- **Ein Wettkampftag hat höchstens ein Aufgebot** (`callupForMatch()` sucht
  per `matchId`, `cwsave` überschreibt ein bestehendes statt ein zweites
  anzulegen) – dadurch ist ein Aufgebot jederzeit nachträglich anpassbar,
  ohne Duplikate zu erzeugen. Wechselt `callupMode` nachträglich, räumt
  `cwsave` die Felder der jeweils anderen Form ab (kein Mischzustand).
- **`keeperId`**: markiert den Torhüter NUR für dieses eine Aufgebot bzw. Team
  (nicht am Spieler selbst) – dieselbe Person kann im nächsten Aufgebot ohne
  Sonderbehandlung wieder als Feldspieler erscheinen.
- **`guests`**: Freitext (Name + optional Team), für Spieler aus anderen
  Teams, die punktuell aushelfen – bewusst kein Verweis auf `players`, da sie
  nicht zum eigenen Kader gehören und keine eigene Anwesenheitsstatistik
  benötigen. Bei `"tournament"` erscheinen sie in der Druckansicht beim
  ersten Team.
- **"Nicht im Aufgebot"** in der Druckansicht: automatisch berechnet
  (`activePlayers()` minus aller aufgebotenen Spieler-IDs, quer über alle
  Teams) – kein manuelles Feld, taucht bei beiden Modi auf.
- **Vorausgefüllte Felder sind gesperrt** (Schritt 1: Gegner/Turnier-
  Bezeichnung, Fahrzeit; Schritt "Teams": Team-Name) – `lockedField()`
  zeigt sie nur als Text mit Stift-Symbol (`ACT.cwfieldedit`, setzt
  `cw.unlocked[key]`) statt als Eingabefeld; erst danach erscheint das
  echte `<input>`. Die rote Mülltonne (`fieldConfirmRow()`, wiederverwendet
  `UI.confirm` wie `confirmRow()`) verlangt eine Bestätigung ("Wirklich
  löschen?"), bevor `ACT.cwfielddel` den Wert leert (bei Team-Namen:
  `ACT.cwremovesquad` entfernt das ganze Team, nur ab zwei Teams sichtbar).
  **Wichtig**: Jeder Handler, der während offener Bearbeitung eines Felds
  neu rendert (`cwsquadcoach`, `cwsquadplayer`, `cwsquadgk`,
  `cwguestadd/-del`, `cwfieldedit/-del`, `cwrowdel`, `cwaddrow`,
  `rowDragEnd`), muss zuerst `captureCallupStep1()`/`captureSquads()`/
  `captureCustomRows()` aufrufen – sonst geht eine gerade getippte, noch
  nicht übernommene Eingabe in einem ANDEREN bereits entsperrten Feld
  beim Neuaufbau des DOM verloren (das hätte fast unbemerkt einen
  Datenverlust verursacht, siehe `tournament_ui.mjs`/`callup_ui.mjs` in
  den Tests).
  **Wichtig 2**: die "auto"/"team"-Zeilen in `renderInfoRows()` (ohne
  eigenen Wert, daher ohne Stift-Symbol) wickeln ihr Label bewusst in ein
  `<div class="f">`, NICHT `<label class="f">` – ein `<label>` ohne `for`
  leitet einen Klick irgendwo im Text (Browser-Standardverhalten) an das
  EINZIGE darin verschachtelte interaktive Element weiter, und wenn dort
  keine Bearbeiten-Schaltfläche existiert, ist das die rote Mülltonne. Ohne
  dieses `<div>` löste jeder Klick auf den Text sofort die Löschbestätigung
  aus, statt nur ein Klick gezielt auf die Mülltonne selbst. Bei Zeilen MIT
  Stift-Symbol (`lockedField()`) bleibt es bei `<label>` – dort landet ein
  Klick auf den Text ohnehin beim (harmlosen) ersten Element, dem Stift.
- **"Angaben im Aufgebot" sind frei sortierbar und erweiterbar**
  (`cw.rows`/`cu.rows`, Schritt 1): eine Liste aus `{key, kind}` für die
  eingebauten Zeilen (`notcalled`/`wann`/`meettime`/`meetplace`/
  `duration`/`addr`/`mitnehmen`, `INFO_ROW_KIND` legt die Art fest –
  `"field"` hat einen echten Wert und nutzt `lockedField()`, `"auto"`/
  `"team"` sind reine Anzeige) plus frei benannte `{key, kind:"custom",
  label, value}`-Zeilen (`ACT.cwaddrow`). Reihenfolge im Wizard = Reihenfolge
  im Ausdruck: `viewCallupPrint()` iteriert dieselbe `cu.rows`-Liste statt
  fest codierter Tabellenzeilen; fehlt `rows` (ältere, vor dieser Funktion
  gespeicherte Aufgebote), greift `defaultInfoRows()` als Fallback. Löschen
  einer Zeile (`ACT.cwrowdel`) entfernt sie nur aus der Liste – bei
  `"field"`-Zeilen bleibt der zugrunde liegende Wert (z. B. `venueAddress`
  für die Fahrzeit-Berechnung) unangetastet, auch wenn die Zeile selbst
  nicht mehr gedruckt wird. Da dadurch kein Wert verloren geht, zeigt
  `renderInfoRows()` unterhalb der Liste für jedes fehlende eingebaute Feld
  einen "+ … wiederherstellen"-Button (`ACT.cwrestorerow`) – kein
  Sicherheitsabfrage-Rückgängig nötig, da versehentliches Löschen risikolos
  ist.
- **Reihenfolge per Ziehen** (`rowDragStart/-Move/-End`, `ROWDRAG`):
  bewusst kein HTML5-Drag&Drop (auf iOS/Touch unzuverlässig), sondern
  Pointer Events auf dem Griff-Icon (`data-drag-handle`, delegiert via
  `document.addEventListener("pointerdown", …)`). Während des Ziehens wird
  nur per `transform: translateY()` visuell verschoben (Nachbar-Zeilen rutschen
  passend mit) – `cw.rows` wird erst beim Loslassen tatsächlich umsortiert
  und einmal neu gerendert. Grund: `render()` ersetzt bei jedem Aufruf das
  komplette DOM (`innerHTML`); ein Re-Render mitten im Ziehen würde den
  gehaltenen Knoten (`ROWDRAG.row`) verwaisen lassen. Ziel-Index beim Ziehen
  wird über die **tatsächlich gemessene** Position/Höhe jeder Zeile bestimmt
  (nächstgelegene ursprüngliche Zeilenmitte), nicht über eine angenommene
  einheitliche Zeilenhöhe – die Liste enthält unterschiedlich hohe Zeilen
  (z. B. zweizeilige Zusatzfelder) und einen CSS-Gap zwischen den Zeilen.
- **Scroll-Position bleibt beim Antippen erhalten**: jeder Wizard-Handler, der
  während eines laufenden Auswahlvorgangs neu rendert (Spieler/Trainer
  an-/abwählen, Feld sperren/entsperren/löschen, Zeile hinzufügen/löschen/
  verschieben, Gastspieler hinzufügen/entfernen), setzt vorher
  `UI.scroll = window.scrollY`, sonst springt `render()` beim Neuaufbau des
  DOM zurück an den Seitenanfang – störend beim Durchtippen einer langen
  Spielerliste. Nur echte Schrittwechsel (`cwnext`/`cwsave`, wie `go()`
  anderswo) scrollen bewusst nach oben.
- **Keine Trainer-Telefonnummern**: gemäss Datensparsamkeits-Grundsatz (siehe
  Abschnitt "Bewusste Nicht-Ziele"/`README.md`) absichtlich nicht im Aufgebot
  enthalten, obwohl die Papiervorlagen sie teils hatten.
- **Logo**: kommt aus `TEAM.logo` (`docs/config.js`, optional, data-URI) –
  NICHT Teil des Datenbestands, da es sich nicht pro Speicherung ändert und
  sonst bei jeder Anfrage mitübertragen würde.
- **Einzeltermin-Formular ist `callupMode`-abhängig beschriftet**
  (`adminPlan()`): bei `"tournament"`-Teams heisst das Feld "Turnier-
  Bezeichnung (für Aufgebot)" statt "Gegner (für Aufgebot)" und das
  Heim/Auswärts-Feld (`#s-ha`) wird ganz ausgeblendet (`val("s-ha")` liefert
  dann `""`, `ACT.addsingle` fällt auf `"away"` zurück) – ohne diese
  Anpassung blieb das Feld bei Turnier-Teams oft leer, weil "Gegner" für ein
  Turnier keinen Sinn ergibt.
- **Druckvorlage: feste, geräteunabhängige Breite** (`@media print .app{...}`
  statt `max-width:none`): ohne festen Wert reflowt der Text beim Drucken vom
  Computer aus über die volle (oft sehr breite) Browserfenster-Breite und
  quetscht den gesamten Ausdruck in wenigen, breiten Zeilen ins obere
  Seitendrittel – auf dem Handy fällt das nicht auf, da der schmale
  Bildschirm ohnehin schon so schmal ist.
  **Seitenränder NICHT über `@page{margin:...}`**: das wird von manchen
  Browsern/Betriebssystemen beim Drucken ignoriert und durch eigene
  Standardränder ersetzt (insbesondere iOS Safari über "Drucken"/"Als PDF
  sichern" – genau dort trat das auf). Stattdessen `@page{margin:0}` plus
  feste Breite/Innenabstand direkt an `.app`: `width:calc(210mm - 80pt)`
  (A4-Breite abzüglich 40pt links/rechts) und `padding:38pt 0` (oben/unten).
  Das wirkt unabhängig vom Drucktreiber immer gleich, weil es normales
  Box-Layout ist statt sich auf CSS-Paged-Media-Unterstützung zu verlassen.
  Geht von A4 aus (in der Schweiz Standard) – bei Letter-Papier wäre die
  Breite falsch bemessen.
  Das Logo (`.capaper .ca-logo{width:175px}`) ist bewusst 75 % größer als
  ursprünglich (100px) – beide Teams nutzen dasselbe eingebettete Vereins-
  logo (`TEAM.logo` in `docs/config.js`), ident für D9b und FA 2018.
- **Titel-Schriftgröße**: `.capaper h2` ist 19.2px (vorher 16px, +20 %).
- **Ausdruck passt garantiert auf eine einzelne DIN-A4-Seite**
  (`fitCapaperOnePage()`, aufgerufen aus `ACT.print` vor `window.print()`,
  nur wenn `.capaper` existiert – der Bericht/`.report` ist davon nicht
  betroffen): die Abstände/Schriftgrößen von `.capaper` liegen als
  CSS-Variablen vor (`--ca-fs`, `--ca-lh`, `--ca-h2-fs`, `--ca-head-mb`,
  `--ca-list-margin`, `--ca-li-mb`, `--ca-tbl-mb`, `--ca-td-pad`) und werden
  über zwei kompaktere Stufen (`.ca-compact`, `.ca-tight`) überschrieben.
  `fitCapaperOnePage()` simuliert kurz die Druckbreite/-Innenabstand aus dem
  `@media print`-Block (`.app` bekommt vorübergehend
  `width:calc(210mm - 80pt)` und `padding:38pt 0`, `.capaper` `padding:0`),
  misst `scrollHeight` gegen das verfügbare Platzbudget
  (`(841.89pt Seitenhöhe − 2×38pt Innenabstand) × 96/72`) und schaltet bei
  Bedarf auf `.ca-compact`, danach nötigenfalls auf `.ca-tight`, bevor die
  temporären Stiländerungen an `.app`/`.capaper` wieder rückgängig gemacht
  werden. Bewusst KEIN `transform:scale()` – Druck-Engines behandeln
  Seitenumbrüche bei skalierten Elementen uneinheitlich (dieselbe
  Unzuverlässigkeit wie bei `@page{margin:...}`, siehe oben); echte
  Box-Layout-Werte (Schriftgröße/Zeilenhöhe/Abstände) werden dagegen von
  jedem Drucktreiber gleich behandelt. `.ca-tight` ist die unterste Stufe –
  bei absurd langem Inhalt (z. B. sehr lange freie Notizen) wird nicht
  darunter verkleinert, um die Lesbarkeit nicht zu gefährden.

---

## 5. API-Vertrag (App ↔ Skript)

Ein einziger Endpunkt: die Web-App-URL des Skripts, aufgerufen per
`POST` mit `Content-Type: text/plain;charset=utf-8` (bewusst „text/plain", um
die CORS-Preflight-Anfrage zu vermeiden, die Apps Script nicht beantwortet).
Body ist JSON.

**Requests**

```jsonc
// Laden
{ "action": "load", "pin": "<app-pin>" }

// Speichern (kompletter Zustand)
{ "action": "save", "pin": "<app-pin>", "rev": 11, "state": { … } }
```

**Responses**

```jsonc
{ "ok": true, "state": { … }, "sheetUrl": "https://docs.google.com/…" }  // load
{ "ok": true, "rev": 12 }                                                // save ok
{ "ok": false, "error": "pin" }                                          // falscher PIN
{ "ok": false, "error": "conflict", "state": { … } }                     // rev veraltet
```

**Fehlercodes** (`error`)

| Code | Bedeutung | Reaktion der App |
|---|---|---|
| `pin` | PIN fehlt/falsch | Sperrbildschirm, Meldung, Zähler-Bremse serverseitig |
| `nopin` | im Skript ist kein PIN gesetzt | Hinweis, `ERSTER_PIN` setzen |
| `conflict` | `rev` ist veraltet, jemand war schneller | App lädt zurückgelieferten Stand, bittet um erneutes Eintragen |
| `busy` | Sperre (LockService) nicht bekommen | „in ein paar Sekunden nochmals" |
| `too_large` | Body > `MAX_BODY` oder Limits überschritten | Meldung |
| `bad_state` | `state` strukturell ungültig | „Seite neu laden" |
| `server` | unerwarteter Fehler (mit `message`) | generische Meldung |

Frontendseitig kommen noch `noconfig` (apiUrl fehlt), `http` (HTTP-Status ≠ 200),
`timeout` (30 s) und `network` hinzu – alle in `failText()`.

**Konfliktprotokoll (optimistic concurrency):** Jede Speicherung schickt die
`rev`, auf der sie basiert. Stimmt sie nicht mit der aktuellen überein,
antwortet der Server mit `conflict` und dem aktuellen Zustand. Es gibt **kein**
Merge – der zuletzt Speichernde muss neu eintragen. Für ein Team von wenigen
Trainern ist das bewusst so gewählt (einfach, nachvollziehbar).

---

## 6. Frontend-Aufbau (`docs/index.html`)

Alles in einer IIFE. Es gibt **kein** Router-Framework; `render()` schreibt je
nach `UI.view` den kompletten `#root`-Inhalt neu, Klicks laufen über einen
zentralen Delegat-Handler auf `data-act`-Attribute (`ACT`-Objekt).

**Wichtige globale Variablen**

- `DB` – aktueller Zustand (nach Login), `REV` – zugehörige Revision.
- `PIN` – App-PIN dieser Sitzung; `UNLOCKED`/`ADMIN_OK` – Freischalt-Flags.
- `UI` – Ansichts-/Filterzustand (`view`, `occ`, `statType`, `adminTab`, …),
  wird teilweise in `sessionStorage` gespiegelt. `UI.callup` (der
  Aufgebot-Wizard-Entwurf) wird bewusst **nicht** gespiegelt – ein
  unfertiger, ungespeicherter Entwurf soll nach einem Neuladen nicht so tun,
  als wäre er noch da. Da `UI.view` aber sehr wohl gespiegelt wird, prüft
  `render()` bei jedem Aufruf zuerst `UI.view === "callup" && !UI.callup` und
  springt in diesem Fall zur Aufgebote-Liste zurück – sonst würde ein
  Neuladen mitten im Wizard fälschlich "Dieser Wettkampftag wurde gelöscht"
  anzeigen. `UI.callupPrintId` (fertige Druckansicht) wird dagegen gespiegelt,
  da dort nichts Unfertiges verloren gehen kann.
- `CFG` – aus `config.js`.

**Ablauf**

1. `boot(pin)` → `apiLoad` → bei Erfolg `DB`/`REV` setzen, `UNLOCKED=true`,
   `render()`. Der PIN wird in `localStorage` (`tp.pin`) gemerkt.
2. Benutzeraktion → `commit(mutate, msg, nextUI)`: klont `DB`, wendet `mutate`
   an, `render()` (optimistisch), `apiSave`. Bei `conflict`/Fehler Rollback.
3. `refresh()` beim Zurückkehren in die App (visibilitychange) lädt neu, wenn
   sich `rev` geändert hat.
4. `commitAvailability(occId, coachId, status, reason)` ist eine bewusste
   Ausnahme neben `commit()`, aus zwei Gründen NICHT blockierend:
   - Anders als `commit()` wartet sie **nie** auf eine laufende Speicherung
     (kein `if (BUSY) return`). Jeder Tipp wendet die Änderung sofort lokal
     an (`applyAvailOp`) und rendert – das eigentliche Speichern läuft über
     eine Warteschlange (`AVAIL_PENDING`/`AVAIL_SAVING`/
     `runAvailabilitySaveLoop()`) im Hintergrund. Schnell aufeinanderfolgende
     Tipps (z. B. beim zügigen Durchgehen vieler Termine in der Planung)
     landen dadurch automatisch gebündelt in weniger Serveraufrufen, statt
     dass jeder einzelne Tipp auf die volle Serverantwort warten müsste.
   - Bei `conflict` werden alle noch offenen (`AVAIL_PENDING`) Änderungen auf
     dem frischen Server-Stand erneut angewendet, bevor weitergespeichert
     wird – die Schleife läuft weiter, bis die Warteschlange leer ist.
   Das ist hier sicher, weil jede Zu-/Absage nur eine einzelne, von allem
   anderen unabhängige Stelle im Zustand verändert (anders als z. B. ein
   Freitext-Kommentar, wo blindes Wiederholen riskant wäre, weil zwei
   Personen dieselbe Stelle unterschiedlich geändert haben könnten – deshalb
   bleibt `commit()` bewusst blockierend und ohne Auto-Retry). Neue
   Funktionen mit demselben "viele kleine, unabhängige Klicks, zügig
   nacheinander"-Charakter wie die Trainer-Planung sollten
   `commitAvailability()`/`runAvailabilitySaveLoop()` als Vorlage nehmen
   statt `commit()` anzufassen.
   - Bei einem sonstigen Fehler (z. B. kurzer Netzausfall, nicht `conflict`/
     `pin`) bleiben nicht gespeicherte Tipps in `AVAIL_PENDING` stehen und
     würden ohne einen weiteren Tipp sonst unbemerkt dauerhaft ungespeichert
     bleiben. `scheduleAvailRetry()` löst nach 4 s automatisch einen
     erneuten `runAvailabilitySaveLoop()`-Durchlauf aus, sofern die
     Warteschlange noch nicht leer ist – deckt den häufigen Fall (Netz kurz
     weg) ab, ohne bei einem echten/dauerhaften Fehler den Server zu fluten.

**Schichten der Funktionen** (Auswahl, alle in `index.html`)

- Server/IO: `apiCall`, `apiLoad`, `apiSave`, `boot`, `refresh`, `commit`,
  `download`, `failText`, `normalize`.
- Domänenlogik: `plannedOccurrences` (erzeugt Termine aus Serien+Einzelterminen
  für einen Zeitraum), `findOccurrence`, `statRecords`, `playerStats`,
  `coachStats` (Trainer-Anwesenheitsquote für die Spesenabrechnung – Anteil
  der Termine im gewählten Zeitraum, bei denen der Trainer in `coachIds`
  steht; verwendet in `viewStats`, `viewReport`, `exportCsv`).
- Ansichten (liefern HTML-Strings): `viewEvents`, `viewRecord`, `viewStats`,
  `viewReport`, `viewAdmin`, `viewAdhoc`, `viewLock`.
- Aktionen: das `ACT`-Objekt bündelt alle `data-act`-Handler.
- Lokale Entwürfe: `loadDraft`/`saveDraft`/`clearDraft` halten eine begonnene,
  noch nicht abgeschlossene Erfassung pro Gerät in `localStorage`.

**PIN-Eingabe:** `addDigit()` sammelt Ziffern. Der **App-PIN** hat unbekannte
Länge und wird erst mit „Weiter"/Enter abgeschickt; der **Admin-PIN** hat
bekannte Länge und wird automatisch geprüft. Tastatur (Ziffern, Backspace,
Enter) wird unterstützt. `viewLock("app")` ersetzt beim Aufruf das komplette
`#root` (volle `100dvh`, daher zentriert `.lock` dort korrekt), während
`viewLock("admin")` innerhalb von `<main class="app">` zwischen Kopfzeile und
unterer Navigation erscheint – dort bekommt `.lock` zusätzlich die Klasse
`.lock-nested` (kleineres `min-height`), sonst zählt `100dvh` Kopfzeile und
Navigation quasi doppelt und schiebt die PIN-Karte sichtbar nach unten aus
der Mitte.

**CSS/Theme:** Design-Tokens als CSS-Variablen; Light/Dark über
`prefers-color-scheme` **und** `[data-theme]`. Druck-Styles im `@media print`.
Wer Farben ändert, ändert Tokens, nicht Einzelregeln.

---

## 7. Sicherheitsmodell (WICHTIG)

Das Bedrohungsmodell ist bewusst schlank, weil die gespeicherten Daten
minimiert sind (Vorname + Initiale + Anwesenheit). Trotzdem gelten feste Regeln:

- **Einziger Zugangsschutz = App-PIN, serverseitig geprüft.** Der Server gibt
  ohne korrekten PIN **nichts** heraus. Niemals einen Codepfad einbauen, der vor
  der PIN-Prüfung Daten zurückgibt.
- **PIN liegt in den Skript-Eigenschaften** (`APP_PIN`, `ADMIN_PIN`), **nicht**
  im Blatt. `writeState()` schreibt Zustand immer durch `stripPins()`. Beim
  Laden werden die PINs nur für den (authentifizierten) Client via `withPins()`
  wieder eingesetzt. → **Nie** die PIN dauerhaft ins Blatt schreiben.
- **Brute-Force-Bremse** (`penaltyMs`): zählt Fehlversuche (Zeitfenster 1 h),
  Wartezeit steigt bis 20 s. Der Schlaf passiert **ausserhalb** der
  LockService-Sperre, damit ein Angreifer echte Trainer nicht blockiert. Eine
  korrekte Anmeldung wird **nie** verzögert und setzt den Zähler zurück.
- **Formel-Injection**: `cell()` (Backend) erzwingt Werte, die mit `= + - @`
  beginnen, als Text, bevor sie ins Blatt geschrieben werden. `q()` (Frontend)
  tut dasselbe für den CSV-Export.
- **Eingabegrenzen**: `MAX_BODY`, `MAX_PLAYERS`, `MAX_COACHES`, `MAX_RECORDS`,
  `validateState()`. `MAX_BODY` ist grosszügig bemessen (3'000'000 Zeichen):
  jede Speicherung überträgt den **gesamten** Datenbestand (keine
  Delta-Übertragung), der mit jedem Termin/jeder Saison weiterwächst – ein zu
  knapper Wert hätte nach wenigen Saisons jede weitere Speicherung dauerhaft
  blockiert.
- **Zeitkonstanter PIN-Vergleich**: `equalsConst()`.

**Bekannte, akzeptierte Restrisiken** (nicht „Bugs"):

- Der **Admin-PIN ist keine echte Grenze** – er wird an den authentifizierten
  Client geliefert und dort geprüft; jeder mit App-PIN kann grundsätzlich alles
  bearbeiten. Wer das ändern will, müsste Admin-Aktionen serverseitig trennen
  (grösserer Umbau, bewusst nicht gemacht).
- **Geteiltes Gerät**: Der App-PIN liegt in `localStorage`. „Abmelden" unter
  Admin → Team löscht ihn.
- **Google-Tabelle nie teilen** – sie enthält alle Namen/Anwesenheiten.
- **CORS ist offen** (`*`), weil Apps Script keine Header liest; irrelevant, da
  ohne PIN nichts herausgeht.

Vor jedem Merge sicherheitsrelevanter Änderungen: die Testszenarien in §9
(insbesondere „Angriff ohne PIN", „PIN nicht im Blatt", „Formel-Injection")
laufen lassen.

---

## 8. Deployment

**Frontend (automatisch):** Push auf `main` → GitHub Pages liefert `/docs`
unter `https://<user>.github.io/trainingspraesenz/`. Kein Build. Nach dem Push
1–2 Minuten warten; Browser-Cache ggf. hart neu laden.

**Backend (manuell, PFLICHT bei Änderungen an `Code.gs`):**
1. Google-Tabelle → Erweiterungen → Apps Script.
2. Inhalt von `apps-script/Code.gs` vollständig hineinkopieren, speichern.
3. Bereitstellen → Bereitstellungen verwalten → vorhandene Web-App bearbeiten
   (Stift) → **Version: Neu** → Bereitstellen. **Die URL bleibt gleich**, daher
   ist keine Änderung an `config.js` nötig.
4. Zugriff muss „**Jeder**" sein, Ausführung „als ich (Betreiber)".

> Eine Änderung an `Code.gs` im Repo allein bewirkt **nichts** in Produktion,
> bis Schritt 1–3 ausgeführt sind. Das ist die häufigste Fehlerquelle.

**Bei mehreren Teams:** Schritt 1–4 sind pro Team einmal in JEDER Tabelle
nötig – es gibt keinen Weg, alle Teams auf einmal zu aktualisieren. `Code.gs`
selbst ist zwischen den Teams identisch; nur `ERSTER_PIN`/`ERSTER_ADMIN_PIN`
(nur beim allerersten Bereitstellen relevant) unterscheiden sich.

---

## 9. Lokal entwickeln & testen

Es gibt keinen Server im Repo; die App ist statisch. Für realistische Tests
wird das Google-Backend mit einem kleinen Node-Mock nachgebildet, der den
**echten** `Code.gs` in einer Sandbox ausführt.

**Voraussetzungen:** Node ≥ 18, für Browsertests Playwright + Chromium.

**Schnellprüfungen (ohne Browser):**
```bash
# Syntax des Backends
node --check apps-script/Code.gs
# Syntax des App-Skripts (aus dem HTML extrahiert)
node -e "const s=require('fs').readFileSync('docs/index.html','utf8'); \
  require('fs').writeFileSync('/tmp/app.js', s.match(/<script id=\"app-code\">([\s\S]*?)\n<\/script>/)[1])" \
  && node --check /tmp/app.js
```

**Backend im Mock ausführen:** Ein Harness stellt die Apps-Script-Globals
(`SpreadsheetApp`, `LockService`, `PropertiesService`, `Utilities`,
`ContentService`, `HtmlService`) bereit und lädt `Code.gs` per `vm`. Damit
lassen sich `doPost`-Aufrufe wie echte Requests testen (Laden, Speichern,
falscher PIN, Konflikt, Limits, Formel-Injection, „PIN nicht im Blatt").

**End-to-End mit echter UI:** Einen lokalen HTTP-Server, der `docs/` ausliefert
und `/exec` an den Mock (oder per `curl` an die echte Web-App) weiterreicht,
dann mit Playwright einen mobilen Viewport steuern. Muster:
`config.js` zur Laufzeit auf `http://localhost:<port>/exec` umbiegen, PIN über
den Ziffernblock eingeben, Abläufe klicken, Server-Zustand gegenprüfen.

**Pflicht-Testszenarien vor einem Merge:**
1. Login (richtiger/falscher PIN), Laden der Termine.
2. Erfassen inkl. Trainerwahl, Zwischenzählung, Speichern; Ankunft im Zustand.
3. Nachträgliches Bearbeiten aktualisiert denselben `record` (kein Duplikat).
4. Konflikt (zweite Speicherung auf veralteter `rev`) wird sauber gemeldet.
5. Auswertung + Bericht + CSV-Export.
6. Admin: Personen/Termine anlegen/pausieren/löschen; PIN-Änderung.
7. Sicherheits-Set aus §7 (ohne PIN kein Zugriff, PIN nicht im Blatt,
   Formel-Injection entschärft, Limits greifen).
8. Dunkles Design, kleines Gerät (320 px, kein horizontales Scrollen).
9. Bei Änderungen an Team-/Speicher-Logik zusätzlich: zwei Teams mit
   BEWUSST kollidierenden IDs (z. B. beide ein `coach.id === "c1"`) gegeneinander
   testen. Muss zeigen: Team A akzeptiert nicht den PIN von Team B; die
   "wer bin ich"-Auswahl und alle Daten von Team B tauchen nach dem Wechsel
   zu Team A nicht auf; Wechsel + Reload landet wieder im richtigen Team.

**Beim Testen gegen die echte Tabelle:** vorher den Zustand per `load` sichern
und nach dem Test wiederherstellen (Testdaten hinterlassen sonst Spuren in der
Auswertung).

---

## 10. Konventionen & typische Aufgaben

- **Stil:** ES5 (`var`, `function`), keine Pfeilfunktionen im Auslieferungscode
  nötig, HTML wird als String zusammengesetzt – Benutzereingaben **immer** durch
  `esc()`. Beim Bauen von Tabellen/Blättern serverseitig `cell()` nicht umgehen.
- **Neues Feld im Zustand:** Default in `normalize()` ergänzen, in der
  betroffenen View rendern, im `ACT`-Handler über `commit()` schreiben, ggf. in
  `renderSheets()` (Backend) und im CSV/Bericht aufnehmen.
- **Neuer Termintyp/Status:** zentral über die `STATUS`-Tabelle bzw.
  `typeLabel()`; danach Auswertung, Bericht, `renderSheets` prüfen.
- **Commit-Messages** auf Deutsch, beschreibend, kein KI-/Modellname im Text.
- **Nach Backend-Änderung** stets an den Redeploy denken (§8).

## 11. Bewusste Nicht-Ziele

Kein Login/Konto, keine echte DB, kein Mehrteam-Betrieb pro Instanz, kein
Realtime, keine Push-Benachrichtigungen, keine Server-Rollen. Wünsche in diese
Richtung sind grosse Architekturänderungen und zuerst mit dem Betreiber zu
klären – nicht nebenbei einbauen.
