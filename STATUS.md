# Arbeitsstand

Diese Datei ist die Übergabe an jedes weitere System, das an diesem Projekt arbeitet. Zu Beginn lesen, vor dem Abschluss der eigenen Änderung nachtragen. Keine PINs und keine Inhalte aus der Google-Tabelle hier eintragen.

**Zuletzt nachgetragen:** 10. November 2026, 21:24 Uhr (Europe/Zurich)

## Wo die Arbeit liegt

- Branch: `cursor/save-reliability-a701`
- Pull Request: https://github.com/iru001/trainingspraesenz/pull/1 (offen, noch nicht auf `main`)
- Die Spitze dieses Branches ist der aktuelle Stand, inklusive dieser Datei.
- Fachliche Änderungen: `9882952` — «Speichern absichern und die Anzeige an die Quote anpassen»
- Backup vor diesen Änderungen: Branch `cursor/backup-before-fixes-a701`, Commit `cd553ea`. Wiederherstellen durch Auschecken dieses Branches.
- `main` hat den neuen Stand noch nicht. Die Datei `apps-script/Code.gs` auf `main` ist die alte Fassung. Bei Google läuft für beide Teams bereits die neue Fassung, siehe unten.

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

Die sichtbare App auf GitHub Pages kommt weiterhin von `main`, bis Pull Request #1 gemergt ist. Das neue Skript versteht die bisherige App: eine Speicherung ohne das Feld `render` zeichnet alle Blätter.

## Offen

- Pull Request #1 ist nicht gemergt. Die Anzeige-Änderungen (Quote, Terminliste, Entwurf, PIN-Hinweis, Schreibkette) sind für die Trainer erst nach dem Merge auf GitHub Pages sichtbar.
- In der echten App wurde danach noch nicht geprüft, ob eine kleine Änderung mit dem gewohnten PIN gespeichert wird.
- Das Skript wurde in den automatischen Tests nur gegen den Nachbau in `tests/gas-harness.mjs` ausgeführt.

## Nicht nebenbei ändern

- `docs/config.js`: echte Team-Adressen und Logos. Tests bauen sich eine eigene Konfiguration. Die Google-Skripte sind schon auf der neuen Fassung. Nicht noch einmal eine neue Bereitstellung anlegen.
- PINs stehen nicht im Repository. Nicht aus der Tabelle oder aus den Skript-Eigenschaften auslesen und hier nicht wiederholen.
- Eigene Eingaben in den lesbaren Blättern der Google-Tabelle werden beim Speichern ersetzt. Geändert wird in der App.
