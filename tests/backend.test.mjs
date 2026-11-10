import assert from "node:assert/strict";
import test from "node:test";
import { loadBackend } from "./gas-harness.mjs";

function blank(over = {}) {
  return {
    v: 1,
    rev: 1,
    settings: { team: "Test", season: "", seasonStart: "", seasonEnd: "", pin: "1234", adminPin: "99" },
    coaches: [],
    players: [],
    rules: [],
    singles: [],
    records: [],
    venues: [],
    callups: [],
    availability: {},
    ...over
  };
}

function sheetText(g, name) {
  const sh = g.book.getSheetByName(name);
  if (!sh) return null;
  return sh._cells.map((row) => (row || []).map((c) => String(c ?? "")).join("|")).join("\n");
}

function col(g, name, index) {
  const sh = g.book.getSheetByName(name);
  if (!sh) return [];
  return sh._cells.map((row) => (row || [])[index]);
}

test("first load seeds an empty database and keeps the pin out of the sheet", () => {
  const g = loadBackend();
  const res = g.handle({ action: "load", pin: "1234" });
  assert.equal(res.ok, true);
  assert.equal(res.state.rev, 1);
  assert.equal(res.state.settings.pin, "1234");
  assert.equal(res.state.settings.adminPin, "99");
  const raw = sheetText(g, "_daten");
  assert.equal(raw.includes("1234"), false);
  assert.equal(g.book.getSheetByName("_daten_neu"), null);
});

test("a failed write leaves the previous sheet intact", () => {
  const g = loadBackend();
  const first = g.handle({ action: "save", pin: "1234", rev: 1, state: blank({ settings: { ...blank().settings, team: "Bleibt" } }) });
  assert.equal(first.ok, true);
  const before = sheetText(g, "_daten");
  g.book.failTmp = true;
  const second = g.handle({ action: "save", pin: "1234", rev: first.rev, state: blank({ rev: first.rev, settings: { ...blank().settings, team: "Weg" } }) });
  assert.equal(second.ok, false);
  assert.equal(second.error, "server");
  assert.equal(sheetText(g, "_daten"), before);
  const loaded = g.handle({ action: "load", pin: "1234" });
  assert.equal(loaded.state.settings.team, "Bleibt");
  assert.equal(loaded.state.rev, first.rev);
});

test("a crash between delete and rename is recovered from the temporary sheet", () => {
  const g = loadBackend();
  const saved = g.handle({
    action: "save", pin: "1234", rev: 1,
    state: blank({ settings: { ...blank().settings, team: "Zwischenstand" } })
  });
  assert.equal(saved.ok, true);
  const daten = g.book.getSheetByName("_daten");
  const copy = daten._cells.map((row) => row.slice());
  g.book.deleteSheet(daten);
  const neu = g.book.insertSheet("_daten_neu");
  copy.forEach((row, i) => { neu._cells[i] = row.slice(); });
  const loaded = g.handle({ action: "load", pin: "1234" });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.settings.team, "Zwischenstand");
  assert.equal(g.book.getSheetByName("_daten_neu"), null);
  assert.ok(g.book.getSheetByName("_daten"));
});

test("state roundtrips across several cells", () => {
  const g = loadBackend();
  g.setChunk(20);
  const team = "Mannschaft mit einem bewusst langen Namen";
  const saved = g.handle({
    action: "save", pin: "1234", rev: 1,
    state: blank({ settings: { ...blank().settings, team } })
  });
  assert.equal(saved.ok, true);
  const rows = g.book.getSheetByName("_daten")._cells.length;
  assert.ok(rows > 1);
  const loaded = g.handle({ action: "load", pin: "1234" });
  assert.equal(loaded.state.settings.team, team);
});

test("a new app pin must be 4 to 16 digits and an empty pin keeps the current one", () => {
  const g = loadBackend();
  const bad = g.handle({
    action: "save", pin: "1234", rev: 1,
    state: blank({ settings: { ...blank().settings, pin: "12" } })
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "bad_pin");
  assert.equal(g.props.APP_PIN, "1234");
  const loaded = g.handle({ action: "load", pin: "1234" });
  assert.equal(loaded.state.rev, 1);

  const keep = g.handle({
    action: "save", pin: "1234", rev: 1,
    state: blank({ settings: { ...blank().settings, pin: "" } })
  });
  assert.equal(keep.ok, true);
  assert.equal(g.props.APP_PIN, "1234");
  assert.equal(g.handle({ action: "load", pin: "1234" }).state.settings.pin, "1234");

  g.props.APP_PIN = "12";
  const unchanged = g.handle({
    action: "save", pin: "12", rev: keep.rev,
    state: blank({ rev: keep.rev, settings: { ...blank().settings, pin: "12", team: "Kurz" } })
  });
  assert.equal(unchanged.ok, true);
  assert.equal(g.props.APP_PIN, "12");
});

test("a stale revision reports conflict before a pin error", () => {
  const g = loadBackend();
  const saved = g.handle({ action: "save", pin: "1234", rev: 1, state: blank() });
  const conflict = g.handle({
    action: "save", pin: "1234", rev: 1,
    state: blank({ settings: { ...blank().settings, pin: "1" } })
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error, "conflict");
  assert.equal(conflict.state.rev, saved.rev);
});

test("na is left out of the session quote and names sort in German", () => {
  const g = loadBackend();
  const entries = {};
  for (let i = 0; i < 7; i++) entries["p" + i] = "present";
  entries.x = "na"; entries.y = "na"; entries.z = "na";
  const state = blank({
    players: [
      { id: "z", first: "Zoe", last: "Zbinden", active: true },
      { id: "m", first: "Max", last: "Müller", active: true },
      { id: "a", first: "Ana", last: "Aebi", active: true }
    ],
    records: [{ id: "r1", date: "2026-11-01", type: "match", label: "Spiel", entries, coachIds: [] }]
  });
  const saved = g.handle({ action: "save", pin: "1234", rev: 1, state });
  assert.equal(saved.ok, true);
  const termine = g.book.getSheetByName("Termine")._cells[1];
  assert.equal(termine[7], 7);
  assert.equal(termine[8], 7);
  assert.equal(termine[9], 1);
  assert.deepEqual(col(g, "Kader", 1).slice(1), ["Aebi", "Müller", "Zbinden"]);
});

test("planning render does not rebuild the roster and an empty callup sheet is removed", () => {
  const g = loadBackend();
  const withCallup = blank({
    players: [{ id: "p", first: "Ana", last: "Aebi", active: true }],
    singles: [{ id: "m1", date: "2026-11-12", type: "match", label: "Alt", opponent: "FC Alt" }],
    callups: [{ id: "c", matchId: "m1", playerIds: ["p"], coachIds: [], guests: [] }]
  });
  let saved = g.handle({ action: "save", pin: "1234", rev: 1, state: withCallup });
  assert.match(sheetText(g, "Kader"), /Aebi/);
  assert.match(sheetText(g, "Aufgebote"), /FC Alt/);

  const renamed = blank({
    rev: saved.rev,
    players: [{ id: "p", first: "Ana", last: "Neu", active: true }],
    singles: withCallup.singles,
    callups: []
  });
  saved = g.handle({ action: "save", pin: "1234", rev: saved.rev, render: "planning", state: renamed });
  assert.equal(saved.ok, true);
  assert.match(sheetText(g, "Kader"), /Aebi/);
  assert.equal(sheetText(g, "Kader").includes("Neu"), false);

  saved = g.handle({ action: "save", pin: "1234", rev: saved.rev, render: "none", state: renamed });
  assert.match(sheetText(g, "Kader"), /Aebi/);

  saved = g.handle({ action: "save", pin: "1234", rev: saved.rev, render: "all", state: renamed });
  assert.match(sheetText(g, "Kader"), /Neu/);
  assert.equal(g.book.getSheetByName("Aufgebote"), null);
});

test("trainer planning is ordered by date and a newer revision is drawn before the lock is released", () => {
  const g = loadBackend();
  const base = blank({
    coaches: [{ id: "c", first: "Tim", last: "Trainer", active: true }],
    singles: [
      { id: "late", date: "2026-11-20", type: "training", label: "Spaeter" },
      { id: "early", date: "2026-11-02", type: "training", label: "Frueher" }
    ],
    availability: {
      late: { c: { status: "confirmed" } },
      early: { c: { status: "declined", reason: "frei" } }
    },
    players: [{ id: "p", first: "Alt", last: "Name", active: true }]
  });
  const first = g.handle({ action: "save", pin: "1234", rev: 1, state: base });
  assert.equal(first.ok, true);
  const dates = col(g, "Trainerplanung", 0).slice(1).filter(Boolean);
  assert.deepEqual(dates, ["02.11.2026", "20.11.2026"]);

  let injected = false;
  g.book.onSetValues = (name) => {
    if (injected || name !== "Trainerplanung") return;
    injected = true;
    const newer = blank({
      rev: 50,
      players: [{ id: "p", first: "Neu", last: "Name", active: true }],
      coaches: base.coaches,
      singles: base.singles,
      availability: base.availability
    });
    g.writeState(newer);
  };
  const second = g.handle({
    action: "save", pin: "1234", rev: first.rev, render: "planning",
    state: blank({ ...base, rev: first.rev, players: [{ id: "p", first: "Mitte", last: "Name", active: true }] })
  });
  assert.equal(second.ok, true);
  assert.match(sheetText(g, "Kader"), /Neu/);
  assert.equal(sheetText(g, "Kader").includes("Mitte"), false);
});

test("a callup whose match was deleted does not leave a header-only sheet", () => {
  const g = loadBackend();
  const saved = g.handle({
    action: "save", pin: "1234", rev: 1,
    state: blank({
      callups: [{ id: "c", matchId: "gone", playerIds: ["p"], coachIds: [] }],
      singles: []
    })
  });
  assert.equal(saved.ok, true);
  assert.equal(g.book.getSheetByName("Aufgebote"), null);
});

test("names that look like formulas are stored as text", () => {
  const g = loadBackend();
  g.handle({
    action: "save", pin: "1234", rev: 1,
    state: blank({ players: [{ id: "p", first: "A", last: "=IMPORTXML()", active: true }] })
  });
  assert.equal(col(g, "Kader", 1)[1], "'=IMPORTXML()");
});
