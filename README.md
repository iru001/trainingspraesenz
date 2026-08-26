# Trainingspräsenz

Web-App zur Anwesenheitserfassung im Fussballtraining und bei Wettkämpfen.
Läuft im Browser jedes Smartphones – ohne Installation, ohne App Store, ohne
Konto. Ein Link und ein PIN genügen.

Die Daten liegen in einer **eigenen Google-Tabelle**: Dieses Repository enthält
nur den Programmcode. Namen, Anwesenheiten und PIN bleiben im Google-Konto der
Person, die die App einrichtet.

**Mehrere Teams möglich:** Jedes Team bekommt eine eigene Google-Tabelle mit
eigenem PIN, komplett unabhängig verwaltbar. Beim Öffnen der App wählt man
zuerst das Team, dann folgt der PIN dieses Teams. Bei nur einem konfigurierten
Team entfällt die Auswahl.

**Einrichtung: siehe [SETUP.md](SETUP.md)** – rund 15 Minuten, einmalig.

## Aufbau

```
docs/index.html      die komplette App (HTML, CSS, JavaScript, ohne Bibliotheken)
docs/config.js       Adresse des Google-Skripts – die einzige Datei, die du anpasst
apps-script/Code.gs  Backend: speichert die Daten und schreibt die Tabellenblätter
SETUP.md             Schritt-für-Schritt-Anleitung (Betrieb)
DEVELOPMENT.md       Entwickler-Dokumentation & Anforderungen
```

Die App spricht das Skript über eine einzige Adresse an; das Skript prüft bei
jeder Anfrage den PIN, bevor es Daten herausgibt. Beim Speichern schreibt es
neben dem Datenbestand auch die lesbaren Blätter `Kader`, `Trainer`,
`Auswertung`, `Termine`, `Matrix` und `Legende`, die sich direkt als Excel
herunterladen lassen.

Gleichzeitiges Speichern ist abgesichert: Wer auf einem veralteten Stand
speichert, bekommt den aktuellen Stand zurück und wird darauf hingewiesen,
statt die Arbeit des anderen zu überschreiben.

## Funktionen

**Anwesenheit erfassen**
- Termine erscheinen als Liste: heute & demnächst, nachzutragen, bereits erfasst
- Pro Termin wird festgehalten, **welche Trainer anwesend sind**
- Vier Zustände pro Spieler: Anwesend (A), Verspätet (V), Entschuldigt (E), Fehlt (F)
- Bei Wettkämpfen zusätzlich «Nicht im Aufgebot» (NA) – rein informativ, wirkt
  sich nicht auf die Anwesenheitsquote aus
- «Alle anwesend» als Startpunkt, danach nur noch die Abweichungen antippen
- Erfassung wird mit **Anwesenheit abschliessen** bestätigt und gespeichert
- Nachträgliches Bearbeiten jederzeit möglich; unbestätigte Eingaben bleiben als
  Entwurf auf dem Gerät erhalten
- Zusätzliche Termine ausserhalb des Plans (Turnier, Zusatztraining) direkt erfassbar

**Trainer-Planung**
- Beim ersten Öffnen wählt jeder Trainer aus einer Liste, wer er ist – danach
  auf dem Gerät gemerkt
- Drei Antworten pro Termin: 👍 Verfügbar, ❓ Ungewiss, 👎 Nicht verfügbar
  (mit optionalem Grund)
- Zu jedem Termin direkt sichtbar, wie viele Trainer mit Ja/Ungewiss/Nein
  geantwortet haben; die einzelnen Namen erst nach Antippen des Termins
- Volle Transparenz: jeder mit App-PIN sieht, wer wie geantwortet oder noch
  nicht reagiert hat
- Zugesagte Trainer werden beim späteren Erfassen der Anwesenheit automatisch
  vorausgewählt

**Auswertung**
- Anwesenheitsquote pro Spieler in Prozent über die ganze Saison
- Anwesenheitsquote pro Trainer (Einsätze / erfasste Termine) – nutzbar für
  die Spesenabrechnung
- Filter nach Training / Wettkampf und nach Zeitraum
- Gesamtquote, Anzahl erfasster Einheiten, Liste aller Termine
- CSV-Export (Spielerübersicht, Trainerübersicht, Terminliste und Matrix
  Spieler × Termin)

**Bericht & Export**
- Druckansicht mit Kopfzeile, Überblick, Spielertabelle, Terminliste und
  Anwesenheitsmatrix; über den Druckdialog als PDF speicherbar
- CSV-Export für Excel (Semikolon-getrennt, mit BOM) – dieselben drei Blöcke
- JSON-Sicherung aller Daten

**Admin**
- Spieler mit Vor- und Nachname, einzeln oder als Liste auf einmal
- Trainer mit Vor-, Nachname und Funktion
- Wöchentliche Trainings- und Wettkampftage mit Wochentag, Von-/Bis-Zeit und Gültigkeit
- Einzeltermine mit Datum, Von-/Bis-Zeit, Bezeichnung sowie bei Wettkämpfen Gegner,
  Heim/Auswärts und Sportplatz-Adresse
- Team, Saison, Saisonzeitraum sowie App-PIN und Admin-PIN

**Aufgebot**
- Schritt-für-Schritt-Wizard für Wettkampftage; zwei Vorlagen, pro Team unter
  «Team» einstellbar:
  - **Einzelspiel**: ein Gegner, Heim/Auswärts, Trainer (1–2), Spieler (bis 14)
  - **Turnier**: keine feste Gegnerschaft, dafür ein oder zwei eigene Teams,
    je mit eigenem Namen, Trainer (1–2) und beliebig vielen Spielern
  In beiden Fällen frei erfassbare Gastspieler und Torhüter-Markierung
- Treffpunkt/-zeit werden vorgeschlagen: 1 Stunde vor Anpfiff am Spielort, bei
  Auswärtsspielen bzw. im Turnier-Modus abzüglich Fahrzeit ab Bülach (Treffpunkt
  dann ein fester, pro Team einstellbarer Ort) – einmal erfasste Fahrzeiten pro
  Sportplatz werden für spätere Aufgebote automatisch vorgeschlagen
- «Nicht im Aufgebot» wird automatisch aus dem Kader berechnet und mit aufgeführt
- Die Angaben im Aufgebot (Wann, Besammlungszeit/-ort, Adresse, Mitnehmen, …) lassen
  sich per Griff-Symbol frei sortieren und um eigene Zusatzfelder (Bezeichnung +
  Text) ergänzen oder wieder löschen – die gewählte Reihenfolge erscheint genauso
  im Ausdruck. Versehentlich gelöschte Standardfelder lassen sich mit einem
  Klick wiederherstellen, ohne dass dabei etwas verloren geht
- Ergebnis ist ein fertiges Aufgebot im Look der bisherigen Papier-Vorlage, druckbar
  bzw. als PDF sicherbar wie der Anwesenheitsbericht
- Bereits erstellte Aufgebote lassen sich jederzeit wieder öffnen und anpassen

## Datensparsamkeit

Zu den Spielern werden bewusst nur Vor- und Nachname gespeichert. Geburtsdaten
werden nicht erfasst; beim Laden entfernt die App allfällige Altbestände aus
den Daten.

## PIN-Schutz

Beim Öffnen verlangt die App den **App-PIN**; der **Admin-Bereich** ist mit einem
zweiten PIN geschützt. Beide sind im Admin unter «Team» änderbar. Der App-PIN
wird pro Gerät gemerkt, der Admin-PIN pro Browsersitzung.

Wichtig: Der PIN hält Unbefugte vom Öffnen ab, ist aber kein echter
Passwortschutz – er steht im Seitenquelltext. Den Link nur im Trainerteam teilen.

Quote = (Anwesend + Verspätet) / erfasste Termine des jeweiligen Spielers.
Spieler ohne Eintrag an einem Termin zählen für diesen Termin nicht mit – wer
später zum Team stösst, bekommt dadurch keine rückwirkenden Fehlzeiten.

## Zugriff

Wer den Artifact-Link mit **Bearbeitungsrecht** hat, kann erfassen und
administrieren. Wer ihn nur zum Ansehen bekommt, sieht die Auswertung, kann aber
nichts verändern – die App schaltet in diesem Fall in den Nur-Lese-Modus.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt und ohne externe Bibliotheken.
Die App spricht ein Google-Apps-Skript per `fetch` an; der Datenbestand liegt
als JSON in einem ausgeblendeten Blatt der Google-Tabelle und wird bei Bedarf
über mehrere Zellen verteilt.
