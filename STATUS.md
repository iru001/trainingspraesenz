# Arbeitsstand

Diese Datei ist die Übergabe an jedes weitere System, das an diesem Projekt arbeitet. Zu Beginn lesen, vor dem Abschluss der eigenen Änderung nachtragen. Keine PINs und keine Inhalte aus der Google-Tabelle hier eintragen.

**Zuletzt nachgetragen:** 10. November 2026, 23:25 Uhr (Europe/Zurich)

## Wo die Arbeit liegt

- `main` ist der aktuelle Stand. Merge-Commit: `1a816c0` — «Speichern absichern und Anzeige korrigieren (#1)», gemergt am 10. November 2026, 22:13 Uhr (Europe/Zurich) durch Irfan Uyar.
- Pull Request: https://github.com/iru001/trainingspraesenz/pull/1 (gemergt)
- Fachliche Änderungen: `9882952` — «Speichern absichern und die Anzeige an die Quote anpassen»
- Backup vor diesen Änderungen: Branch `cursor/backup-before-fixes-a701`, Commit `cd553ea`. Wiederherstellen durch Auschecken dieses Branches.
- GitHub Pages hat den Stand `1a816c0` gebaut. Die App unter https://iru001.github.io/trainingspraesenz/ enthält die neue Anzeige.

## Erledigt im Pull Request

- Schreiben des Datenbestands zuerst nach `_daten_neu`, danach umbenennen. Ein fehlgeschlagenes Schreiben lässt `_daten` stehen. Fehlt `_daten`, wird `_daten_neu` übernommen.
- Blattaufbau liest den jüngsten Stand. Zu-/Absagen zeichnen nur `Trainerplanung`. Leere Blätter `Aufgebote` und `Trainerplanung` werden entfernt. Die Planung ist nach Datum sortiert.
- Anwesenheit und Zu-/Absagen laufen nacheinander. Offene Tipps liegen in `sessionStorage` (`tp.avail.<teamId>`), werden erneut versucht, und der Hinweis verschwindet, sobald der Server sie angenommen hat. Ein älterer Ladevorgang überschreibt einen neueren Stand nicht.
- `NA` zählt in der Terminquote nicht mit. Namen sortieren mit `localeCompare(..., "de")`.
- Gespeicherter leerer Gegner, leere Dauer und leeres «Mitnehmen» bleiben leer. Pausierte, bereits gewählte Personen bleiben abwählbar. Pausierte Trainer mit Einsätzen bleiben in der Auswertung.
- Ein neuer App-PIN braucht 4–16 Ziffern. Ein leeres Feld behält den bisherigen PIN. Der Admin-PIN darf leer sein.
- Die Terminliste zeigt alle anstehenden und nachzutragenden Termine. Ältere Erfassungen öffnet «Weitere anzeigen». Ein Entwurf steht auch neben einer abgeschlossenen Erfassung.
- Der Ferienhinweis erscheint erst, wenn das letzte Ferienende weniger als ein Jahr entfernt ist. Die Liste reicht bis 20. August 2033, deshalb ist der Hinweis am 10. November 2026 aus.
- Tests: `npm test` (21 Tests, grün am 10. November 2026). Backend über `tests/gas-harness.mjs`, Frontend über jsdom. Browserprüfung gegen `node tests/browser-server.mjs` auf `http://127.0.0.1:8765/`, ohne die echten Google-Adressen.
- `docs/config.js` wurde nicht geändert.

## Bei Google bereits veröffentlicht

Am 10. November 2026, abends (Europe/Zurich), wurden die bestehenden Web-Apps auf die neue `Code.gs` dieses Branches gebracht. Die `/exec`-Adressen sind gleich geblieben und stimmen mit `docs/config.js` überein. Es wurde keine neue Bereitstellung angelegt. Die PIN-Zeilen im Skript blieben leer, die Skript-Eigenschaften wurden nicht gelesen.

- FA 2018, Tabelle «Trainingspräsenz FA 2018»: Version 7, vorher Version 6.
- Db, Tabelle «Trainingspräsenz D9b»: Version 6, vorher Version 5. Der Tabellenname lautet D9b. Die Web-App-Adresse ist die von Team `db`.

Die sichtbare App auf GitHub Pages kommt von `main` und ist seit dem Merge auf dem neuen Stand. Das neue Skript versteht auch eine ältere App: eine Speicherung ohne das Feld `render` zeichnet alle Blätter.

## Zuletzt in der echten Tabelle geprüft

Am 10. November 2026, 22:11 Uhr (Europe/Zurich), nur gelesen, nichts geschrieben. FA 2018 hat heute keine neue Erfassung; die Datei wurde zuletzt um 21:21 Uhr angefasst, passend zur Skript-Veröffentlichung. Bei D9b ist um 22:07 Uhr eine neue Erfassung angekommen und in `Termine` sichtbar. Die Quote dort rechnet ohne `NA` und ohne inaktive Spieler. Keine PIN und keine Namensliste hier.

## Hallenturniere

Am 10. November 2026, 23:25 Uhr (Europe/Zurich), wurden fehlende Hallenturnier-Termine in `_daten` ergänzt, ohne neue Spieler und ohne Aufgebote. FA 2018: 6 neue Termine, 5 bestehende Hallenturniere unverändert. D9b: 5 neue Termine. Unbekannte Startzeit bleibt leer und steht als «Zeit offen» in der Bezeichnung. «nicht bestätigt» steht in der Bezeichnung. Die Blätter `Termine` und `Aufgebote` zeichnet die App beim nächsten Speichern neu. In der App sind die Termine nach einem Neuladen sichtbar.

## Offen

- Das Skript wurde in den automatischen Tests nur gegen den Nachbau in `tests/gas-harness.mjs` ausgeführt. Die eine echte Speicherung bei D9b ist angekommen; ein zweites Team und ein Konfliktfall in der echten Tabelle sind damit nicht geprüft.

## Nicht nebenbei ändern

- `docs/config.js`: echte Team-Adressen und Logos. Tests bauen sich eine eigene Konfiguration. Die Google-Skripte sind schon auf der neuen Fassung. Nicht noch einmal eine neue Bereitstellung anlegen.
- PINs stehen nicht im Repository. Nicht aus der Tabelle oder aus den Skript-Eigenschaften auslesen und hier nicht wiederholen.
- Eigene Eingaben in den lesbaren Blättern der Google-Tabelle werden beim Speichern ersetzt. Geändert wird in der App.
