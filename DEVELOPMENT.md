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
  des aktuell gewählten Teams zurück.
- **Konfiguration** (`docs/config.js`): setzt `window.TP_CONFIG.teams` – eine
  Liste von Teams, jedes mit eigener `apiUrl`. Einzige betreiberspezifische
  Datei. Siehe §3a.
- **Backend** (`apps-script/Code.gs`): dünne Schicht über einer Google-Tabelle.
  Prüft den PIN, liest/schreibt den JSON-Zustand in ein ausgeblendetes Blatt
  `_daten` und rendert daraus lesbare Blätter für den Excel-Export. **Kennt
  keine Teams** – jede Bereitstellung von `Code.gs` bedient genau EIN Team
  (eine Tabelle). Mehrere Teams entstehen durch mehrere unabhängige
  Bereitstellungen desselben, unveränderten Skripts.
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
    { id: "db",     name: "Db",      apiUrl: "https://script.google.com/.../exec" }
  ]
};
```
`id` ist ein fester, kurzer Code (keine Sonderzeichen) – er ist Teil von
`localStorage`-Schlüsseln und darf sich nach dem Ausrollen nicht mehr ändern,
sonst "vergisst" jedes Gerät seinen gemerkten PIN für dieses Team. Ist nur ein
Team konfiguriert, wird die Team-Auswahl automatisch übersprungen.

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
    "adminPin": "••••"       //   (Quelle der Wahrheit: Skript-Eigenschaften)
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
  "singles": [               // Einzeltermine (z. B. Turniere)
    { "id": "s1", "type": "match", "date": "2026-08-22", "time": "12:00",
      "timeEnd": "16:00", "label": "PMF-Turnier …" }
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
  }
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
- **Status-Werte** in `entries`: genau `"present" | "late" | "excused" | "absent"`
  (UI-Kürzel A/V/E/F). Ein Spieler ohne Eintrag zählt für diesen Termin **nicht**
  in die Statistik.
- **Quote** = (`present` + `late`) / Anzahl Termine mit Eintrag. Zentral in
  `playerStats()`; wer die Definition ändert, muss Backend-`renderSheets` und den
  Bericht anpassen.
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
  wird teilweise in `sessionStorage` gespiegelt.
- `CFG` – aus `config.js`.

**Ablauf**

1. `boot(pin)` → `apiLoad` → bei Erfolg `DB`/`REV` setzen, `UNLOCKED=true`,
   `render()`. Der PIN wird in `localStorage` (`tp.pin`) gemerkt.
2. Benutzeraktion → `commit(mutate, msg, nextUI)`: klont `DB`, wendet `mutate`
   an, `render()` (optimistisch), `apiSave`. Bei `conflict`/Fehler Rollback.
3. `refresh()` beim Zurückkehren in die App (visibilitychange) lädt neu, wenn
   sich `rev` geändert hat.
4. `commitAvailability(occId, coachId, status, reason)` ist eine bewusste
   Ausnahme neben `commit()`: sie nutzt denselben Speicherweg (volle
   State-Speicherung, `rev`-gated), wiederholt bei `conflict` aber **einmal
   automatisch** auf dem frischen Stand, statt den Nutzer erneut klicken zu
   lassen. Das ist hier sicher, weil eine Zu-/Absage nur eine einzelne, von
   allem anderen unabhängige Stelle im Zustand verändert. `commit()` selbst
   bleibt bewusst OHNE Auto-Retry: Für z. B. einen Freitext-Kommentar wäre
   ein blindes Wiederholen riskant (zwei Personen könnten dieselbe Stelle
   unterschiedlich geändert haben). Neue Funktionen mit demselben
   "viele kleine, unabhängige Klicks"-Charakter wie die Trainer-Planung
   sollten `commitAvailability()` als Vorlage nehmen statt `commit()`
   anzufassen.

**Schichten der Funktionen** (Auswahl, alle in `index.html`)

- Server/IO: `apiCall`, `apiLoad`, `apiSave`, `boot`, `refresh`, `commit`,
  `download`, `failText`, `normalize`.
- Domänenlogik: `plannedOccurrences` (erzeugt Termine aus Serien+Einzelterminen
  für einen Zeitraum), `findOccurrence`, `statRecords`, `playerStats`.
- Ansichten (liefern HTML-Strings): `viewEvents`, `viewRecord`, `viewStats`,
  `viewReport`, `viewAdmin`, `viewAdhoc`, `viewLock`.
- Aktionen: das `ACT`-Objekt bündelt alle `data-act`-Handler.
- Lokale Entwürfe: `loadDraft`/`saveDraft`/`clearDraft` halten eine begonnene,
  noch nicht abgeschlossene Erfassung pro Gerät in `localStorage`.

**PIN-Eingabe:** `addDigit()` sammelt Ziffern. Der **App-PIN** hat unbekannte
Länge und wird erst mit „Weiter"/Enter abgeschickt; der **Admin-PIN** hat
bekannte Länge und wird automatisch geprüft. Tastatur (Ziffern, Backspace,
Enter) wird unterstützt.

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
  `validateState()`.
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
