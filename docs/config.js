/**
 * Verbindung zu den Google-Tabellen der einzelnen Teams.
 *
 * Jedes Team hat eine EIGENE Google-Tabelle mit eigenem Google-Skript und
 * eigenem PIN - komplett unabhängig voneinander, auch von unterschiedlichen
 * Personen verwaltbar. Diese Datei listet nur auf, welche Teams es gibt und
 * unter welcher Adresse ihr jeweiliges Skript erreichbar ist.
 *
 * `id`: kurzer, fester Code für dieses Team (keine Leerzeichen/Sonderzeichen) -
 *   wird verwendet, um PIN und "wer bin ich" pro Team getrennt auf dem Gerät
 *   zu merken. Einmal vergeben, nicht mehr ändern.
 * `name`: Anzeigename auf dem Auswahlbildschirm.
 * `apiUrl`: die Web-App-Adresse des jeweiligen Google-Skripts, endet auf
 *   /exec und muss in Anführungszeichen stehen. Wie man sie bekommt, steht
 *   in SETUP.md, Schritt 3.
 *
 * Ein weiteres Team hinzufügen: SETUP.md, Abschnitt "Weiteres Team
 * hinzufügen" - dort einfach einen weiteren Eintrag in dieses Feld einfügen.
 */
window.TP_CONFIG = {
  teams: [
    { id: "fa2018", name: "FA 2018",
      apiUrl: "https://script.google.com/macros/s/AKfycbxsDrYQUklwHnFVTNe6wNSf1SF8VNALGgCWrEzZKarC10BLzoa3JvWkhuBaq3mS4EGo1g/exec" },
    { id: "db", name: "Db",
      apiUrl: "HIER_DIE_ADRESSE_DES_ZWEITEN_GOOGLE_SKRIPTS_EINFUEGEN" }
  ]
};
