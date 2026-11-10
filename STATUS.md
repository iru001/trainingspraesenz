# Arbeitsstand

Diese Datei ist die Übergabe an jedes weitere System, das an diesem Projekt arbeitet. Zu Beginn lesen, vor dem Abschluss der eigenen Änderung nachtragen. Keine PINs und keine Inhalte aus der Google-Tabelle hier eintragen.

**Zuletzt nachgetragen:** 10. November 2026, 20:17 Uhr (Europe/Zurich)

## Wo die Arbeit liegt

- Branch: `cursor/save-reliability-a701`
- Pull Request: https://github.com/iru001/trainingspraesenz/pull/1 (offen, noch nicht auf `main`)
- Letzter Commit auf dem Branch: `9882952` — «Speichern absichern und die Anzeige an die Quote anpassen»
- Backup vor diesen Änderungen: Branch `cursor/backup-before-fixes-a701`, Commit `cd553ea`. Wiederherstellen durch Auschecken dieses Branches.
- `main` hat den neuen Stand noch nicht. `apps-script/Code.gs` auf `main` ist die alte Fassung.

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

## Was die betreuende Person noch selbst tun muss

Das neue `apps-script/Code.gs` läuft bei Google erst nach einer neuen Version der **bestehenden** Web-App. Das ist für **beide** Tabellen nötig, FA 2018 und Db. Keine neue Bereitstellung anlegen, sonst ändert sich die Adresse.

1. Den Text von diesem Branch nehmen: https://raw.githubusercontent.com/iru001/trainingspraesenz/cursor/save-reliability-a701/apps-script/Code.gs
2. In der jeweiligen Tabelle: Erweiterungen → Apps Script, gesamten Inhalt von `Code.gs` ersetzen, speichern.
3. `ERSTER_PIN` und `ERSTER_ADMIN_PIN` leer lassen. Der gültige PIN liegt schon in den Skript-Eigenschaften.
4. Bereitstellen → Bereitstellungen verwalten → Stift → Version: Neue Version → Bereitstellen. Zugriff bleibt «Jeder», ausführen als «Ich». Die `/exec`-Adresse bleibt gleich.
5. In der App mit dem gewohnten PIN prüfen, ob eine kleine Änderung gespeichert wird.

`docs/config.js` danach nicht anfassen.

## Offen

- Pull Request #1 ist nicht gemergt. Solange das so ist, sieht `main` die Änderungen nicht.
- Die beiden Google-Skripte sind noch nicht auf die neue Fassung gebracht. Bis dahin speichert die live App mit dem alten Verhalten.
- Das Skript wurde nicht gegen das echte Google Apps Script ausgeführt, nur gegen den Nachbau in `tests/gas-harness.mjs`.

## Nicht nebenbei ändern

- `docs/config.js`: echte Team-Adressen und Logos. Tests bauen sich eine eigene Konfiguration.
- PINs stehen nicht im Repository. Nicht aus der Tabelle oder aus den Skript-Eigenschaften auslesen und hier nicht wiederholen.
- Eigene Eingaben in den lesbaren Blättern der Google-Tabelle werden beim Speichern ersetzt. Geändert wird in der App.
