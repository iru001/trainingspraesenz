# Einrichtung: App auf eigener Adresse mit Google-Tabelle

Diese Anleitung schaltet die App so frei, dass sie **jeder Trainer über einen
normalen Link öffnen kann** – ohne Konto, ohne Installation. Die Daten liegen in
einer Google-Tabelle in deinem Google Drive.

Einmaliger Aufwand: rund 15 Minuten. Danach musst du hier nie wieder etwas tun.

---

## Schritt 1 – Google-Tabelle anlegen

1. [drive.google.com](https://drive.google.com) öffnen.
2. **Neu → Google Tabellen → Leere Tabelle**.
3. Der Tabelle oben links einen Namen geben, z. B. `Trainingspräsenz FA 2018`.

Diese Tabelle ist ab jetzt der Datenspeicher. Du musst nichts hineinschreiben –
die App legt die Blätter selbst an.

## Schritt 2 – Skript einfügen

1. In der Tabelle: **Erweiterungen → Apps Script**. Es öffnet sich ein Editor
   mit einer Datei `Code.gs`, die ein leeres `myFunction` enthält.
2. Den gesamten vorhandenen Inhalt löschen.
3. Den kompletten Inhalt von [`apps-script/Code.gs`](apps-script/Code.gs) aus
   diesem Repository kopieren und einfügen.
4. **Ganz oben die beiden PIN eintragen** – zwischen die Anführungszeichen:

   ```js
   var ERSTER_PIN = '482915';        // Zugang zur App, mind. 6 Ziffern
   var ERSTER_ADMIN_PIN = '204871';  // schützt den Admin-Bereich
   ```

   Nimm für den App-PIN **mindestens sechs Ziffern**. Die Adresse der App ist
   öffentlich, der PIN ist der einzige Zugangsschutz. Ändern lassen sich beide
   später in der App unter *Admin → Team*.
5. Oben auf das **Disketten-Symbol** (Speichern) klicken.

## Schritt 3 – Als Web-App bereitstellen

1. Oben rechts **Bereitstellen → Neue Bereitstellung**.
2. Beim Zahnrad neben «Typ auswählen» **Web-App** wählen.
3. Ausfüllen:
   - **Beschreibung**: `Trainingspräsenz`
   - **Ausführen als**: *Ich* (deine Google-Adresse)
   - **Zugriff**: **Jeder** ← wichtig, nicht «Jeder mit Google-Konto»
4. **Bereitstellen** klicken.
5. Google fragt nach Berechtigungen. Dabei erscheint eine Warnung
   «Google hat diese App nicht überprüft» – das ist normal, es ist dein eigenes
   Skript. **Erweitert → Weiter zu «Trainingspräsenz» (unsicher)** und
   **Zulassen**.
6. Am Schluss wird eine **Web-App-URL** angezeigt. Sie endet auf `/exec` und
   sieht so aus:

   ```
   https://script.google.com/macros/s/AKfycb.................../exec
   ```

   **Diese Adresse kopieren.**

> **Wenn du später etwas am Skript änderst:** Nicht nur speichern, sondern
> **Bereitstellen → Bereitstellungen verwalten → Stift-Symbol → Version: Neu →
> Bereitstellen**. Ohne neue Version läuft weiterhin die alte Fassung.

## Schritt 4 – Adresse in die App eintragen

1. In diesem Repository die Datei [`docs/config.js`](docs/config.js) öffnen.
2. Auf das Stift-Symbol (Bearbeiten) klicken.
3. `HIER_DIE_ADRESSE_DES_GOOGLE_SKRIPTS_EINFUEGEN` durch die kopierte Adresse
   ersetzen – die Anführungszeichen stehen lassen:

   ```js
   window.TP_CONFIG = {
     apiUrl: "https://script.google.com/macros/s/AKfycb.../exec"
   };
   ```
4. **Commit changes** klicken.

## Schritt 5 – GitHub Pages einschalten

1. Im Repository auf **Settings → Pages**.
2. Unter **Source**: *Deploy from a branch*.
3. **Branch**: `main`, Ordner: **`/docs`** → **Save**.
4. Nach ein paar Minuten ist die App erreichbar unter:

   ```
   https://<dein-benutzername>.github.io/trainingspraesenz/
   ```

> GitHub Pages ist für **öffentliche** Repositories gratis. Bei einem privaten
> Repository blendet GitHub den Hinweis «Upgrade or make this repository public»
> ein – dann braucht es ein kostenpflichtiges Konto.

## Schritt 6 – Prüfen und teilen

1. Den Link auf dem Handy öffnen → der Ziffernblock erscheint → PIN eingeben.
2. Beim ersten Öffnen legt das Skript die Blätter `Kader`, `Trainer`,
   `Auswertung`, `Termine`, `Matrix` und `Legende` in der Tabelle an.
   Spieler, Trainer und Termine trägst du danach in der App unter **Admin** ein.
3. Link und PIN an die Trainer geben. Auf dem Handy über das Teilen-Menü
   **«Zum Startbildschirm hinzufügen»** – danach verhält sich die App wie eine
   installierte App.

---

## Excel-Export

In der Google-Tabelle: **Datei → Herunterladen → Microsoft Excel (.xlsx)**.

Die Blätter werden bei **jeder** Speicherung in der App neu geschrieben. Eigene
Eingaben direkt in der Tabelle gehen deshalb verloren – die Tabelle ist zum
Ansehen und Exportieren da, geändert wird immer in der App.

Alternativ direkt aus der App: **Auswertung → Für Excel exportieren (CSV)** oder
**Bericht & Druckansicht** für ein PDF.

## Sicherheit – bitte lesen

Die App ist über ihre Adresse öffentlich erreichbar. Den Zugang regelt allein
der **App-PIN**: Ohne ihn gibt der Server keine Daten heraus, auch keine Namen.

Weil die Adresse öffentlich ist, gilt:

- **Nimm mindestens 6 Ziffern als PIN.** Ein vierstelliger PIN hat nur 10 000
  Möglichkeiten. Das Skript bremst zwar jeden Fehlversuch aus, aber sechs
  Ziffern machen das Durchprobieren endgültig aussichtslos.
- **Gib den PIN nur im Trainerteam weiter** – nicht im Elternchat.
- **Verlässt jemand das Team**, ändere den PIN unter Admin → Team.
- Der **Admin-PIN** schützt nur den Admin-Bereich vor versehentlichen
  Änderungen. Er ist kein zweiter Sicherheitsriegel.

Gespeichert werden ausschliesslich Vor- und Nachname der Spieler sowie die
Anwesenheiten. Keine Geburtsdaten, keine Adressen, keine Kontaktdaten.

## Wenn etwas nicht funktioniert

| Meldung in der App | Ursache und Lösung |
|---|---|
| «noch nicht mit der Google-Tabelle verbunden» | Die Adresse in `docs/config.js` fehlt oder steht nicht in Anführungszeichen. |
| «Im Google-Skript ist noch kein PIN gesetzt» | Schritt 2.4: `ERSTER_PIN` im Skript ausfüllen und neue Version bereitstellen. |
| «Server hat mit Fehler 401/403 geantwortet» | In Schritt 3 wurde beim Zugriff nicht **Jeder** gewählt. Bereitstellung bearbeiten und korrigieren. |
| «Keine Verbindung zum Server» | Internetverbindung prüfen. Bleibt es dabei: Skript-Adresse im Browser öffnen – es muss die Meldung «Backend läuft» erscheinen. |
| «Falscher PIN», obwohl er stimmt | Nach einer PIN-Änderung gilt der neue PIN sofort auf allen Geräten. |
| Änderungen am Skript wirken nicht | Neue Version bereitstellen (siehe Hinweis in Schritt 3). |
