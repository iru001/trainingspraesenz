import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const htmlPath = new URL("../docs/index.html", import.meta.url);

function pageHtml() {
  const html = fs.readFileSync(htmlPath, "utf8");
  const config = `<script>window.TP_CONFIG=${JSON.stringify({
    teams: [{ id: "t", name: "Test", apiUrl: "https://example.test/exec" }]
  })};</script>`;
  return html.replace('<script src="config.js"></script>', config);
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function settled() {
  for (let i = 0; i < 10; i++) await delay(0);
}

function loadApp(options = {}) {
  const fetches = [];
  let inflight = 0;
  let maxInflight = 0;
  const dom = new JSDOM(pageHtml(), {
    url: "http://127.0.0.1/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      if (options.prepare) options.prepare(window);
      window.fetch = (url, init) => {
        const body = JSON.parse(init.body);
        fetches.push(body);
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        const run = async () => {
          try {
            const data = await (options.onFetch ? options.onFetch(body, { inflight }) : { ok: true, rev: (body.rev || 0) + 1, state: body.state || {}, sheetUrl: "" });
            return { ok: true, json: async () => data };
          } finally {
            inflight--;
          }
        };
        if (options.hold) return new Promise((resolve, reject) => options.hold.push({ body, resolve, reject, run }));
        return run();
      };
    }
  });
  const api = dom.window.__TP_TEST;
  if (!api) throw new Error("test hook missing");
  return { dom, api, fetches, stats: () => ({ inflight, maxInflight }) };
}

function sample(over = {}) {
  return {
    v: 1,
    rev: 3,
    settings: {
      team: "Test", season: "2026", seasonStart: "2026-08-01", seasonEnd: "2027-06-30",
      pin: "1234", adminPin: "99", callupMode: "match"
    },
    coaches: [
      { id: "c1", first: "Tim", last: "Trainer", active: true, role: "" },
      { id: "c2", first: "Pia", last: "Pause", active: false, role: "" }
    ],
    players: [
      { id: "p1", first: "Ana", last: "Aebi", active: true },
      { id: "p2", first: "Max", last: "Müller", active: true },
      { id: "p3", first: "Zoe", last: "Zbinden", active: false }
    ],
    rules: [],
    singles: [],
    records: [],
    venues: [],
    callups: [],
    availability: {},
    ...over
  };
}

test("session quote, german sort, pin and holiday helpers", () => {
  const { api } = loadApp();
  const counts = api.sessionCounts({ a: "present", b: "late", c: "na", d: "excused", e: "nope" });
  assert.equal(counts.here, 2);
  assert.equal(counts.tot, 3);
  const names = [
    { first: "Zoe", last: "Zbinden" },
    { first: "Max", last: "Müller" },
    { first: "Ana", last: "Aebi" }
  ].sort(api.sortName).map((p) => p.last);
  assert.deepEqual(names, ["Aebi", "Müller", "Zbinden"]);
  assert.equal(api.matchOpponent({ label: "Spiel gegen Alt", opponent: "" }), "");
  assert.equal(api.matchOpponent({ label: "Spiel gegen Alt" }), "Spiel gegen Alt");
  assert.equal(api.savedOr({ duration: "" }, "duration", "90 Min"), "");
  assert.equal(api.savedOr({}, "duration", "90 Min"), "90 Min");
  assert.match(api.appPinError("", "1234"), /leer/);
  assert.match(api.appPinError("12", "1234"), /4/);
  assert.equal(api.appPinError("12", "12"), "");
  assert.equal(api.appPinError("1234", "1234"), "");
  assert.equal(api.holidayHorizonWarning("2026-11-10"), "");
  assert.equal(api.holidayHorizonWarning("2032-09-01"), "2033-08-20");
});

test("saved empty callup fields stay empty and paused people stay selectable", () => {
  const { api } = loadApp();
  api.loadDB(sample({
    singles: [{ id: "m1", date: "2026-11-12", type: "match", label: "Spiel gegen Alt", opponent: "", time: "18:00", timeEnd: "19:30", homeAway: "away" }],
    callups: [{ id: "cu", matchId: "m1", duration: "", mitnehmen: "", playerIds: ["p3"], coachIds: ["c2"], guests: [{ name: "Gast", team: "D9" }] }]
  }));
  const cw = api.newCallupState("m1");
  assert.equal(cw.opponent, "");
  assert.equal(cw.duration, "");
  assert.equal(cw.mitnehmen, "");
  assert.deepEqual(cw.playerIds, ["p3"]);
  assert.ok(api.rosterFor(["p3"]).some((p) => p.id === "p3"));
  assert.ok(api.coachesFor(["c2"]).some((c) => c.id === "c2"));
  const fresh = api.newCallupState("missing");
  assert.equal(fresh.duration, "");
  assert.equal(fresh.guests.length, 0);

  const stats = api.coachStats([
    { id: "r", date: "2026-11-01", coachIds: ["c2"], entries: {} }
  ]);
  assert.deepEqual(stats.map((s) => s.c.id), ["c2", "c1"]);
  assert.equal(stats[0].n, 1);
});

test("old callups without squad arrays still render", () => {
  const { api } = loadApp();
  api.loadDB(sample({
    settings: { ...sample().settings, callupMode: "tournament" },
    singles: [{ id: "m1", date: "2026-11-12", type: "match", label: "Internes Event", opponent: "", time: "10:00" }],
    callups: [{ id: "cu", matchId: "m1", squads: [{ name: "Team A" }] }]
  }));
  api.setAdmin(true);
  api.setUI({ view: "callupprint", callupPrintId: "m1" });
  assert.doesNotThrow(() => api.render());
  assert.match(api.html(), /das Turnier/);
  assert.equal(api.html().includes("Internes Event"), false);

  api.setUI({
    view: "callup",
    callup: { matchId: "m1", step: 3, mode: "match", rows: [] }
  });
  assert.doesNotThrow(() => api.render());
  api.setUI({
    view: "callup",
    callup: { matchId: "m1", step: 2, mode: "tournament", squads: [{ name: "Team A" }], rows: [] }
  });
  assert.doesNotThrow(() => api.render());
});

test("event list shows every open session, a draft beside a saved record, and more recorded sessions", () => {
  const { dom, api } = loadApp();
  const records = [];
  for (let i = 0; i < 61; i++) {
    const day = String((i % 27) + 1).padStart(2, "0");
    const month = String((i % 12) + 1).padStart(2, "0");
    records.push({
      id: "r" + i,
      date: `2024-${month}-${day}`,
      time: String(i).padStart(2, "0") + ":00",
      type: "training",
      label: i === 0 ? "AELTESTE" : "Termin " + i,
      entries: { p1: "present", p2: "na", p3: "present" },
      coachIds: ["c1"]
    });
  }
  api.loadDB(sample({ records }));
  api.setUI({ view: "events", doneLimit: 60 });
  api.render();
  let html = api.html();
  assert.match(html, /2\/2/);
  assert.equal(html.includes("2/3"), false);
  assert.match(html, /Weitere anzeigen \(1\)/);
  assert.equal(html.includes("AELTESTE"), false);
  api.act("moredone");
  html = api.html();
  assert.match(html, /AELTESTE/);
  assert.equal(html.includes("Weitere anzeigen"), false);

  dom.window.localStorage.setItem("tp.draft.r60", JSON.stringify({ entries: { p1: "absent" }, coachIds: ["c2"], note: "lokal" }));
  api.setUI({ view: "record", occ: "r60" });
  api.render();
  html = api.html();
  assert.match(html, /abgeschlossen/);
  assert.match(html, /Entwurf auf diesem Gerät/);
  assert.match(html, /pausiert/);
});

test("cleared opponent does not fall back to the match label", () => {
  const { api } = loadApp();
  api.loadDB(sample({
    singles: [{ id: "m1", date: "2026-11-12", type: "match", label: "Spiel gegen Alt", opponent: "", time: "18:00" }],
    callups: [{ matchId: "m1", playerIds: [], coachIds: [] }]
  }));
  api.setAdmin(true);
  api.setUI({ view: "admin", adminTab: "callups" });
  api.render();
  const html = api.html();
  assert.match(html, /Wettkampf/);
  assert.equal(html.includes("Spiel gegen Alt"), false);
  api.setUI({ view: "admin", adminTab: "plan" });
  api.render();
  assert.equal(api.html().includes("Schulferien enden"), false);
  assert.match(api.html(), /mindestens 4 Ziffern|Termine/);
});

test("one save at a time and a refresh waits while answers are unsaved", async () => {
  const held = [];
  let rev = 5;
  const { api, stats } = loadApp({
    hold: held,
    onFetch() {
      rev += 1;
      return { ok: true, rev };
    }
  });
  api.loadDB(sample({ rev: 5 }));
  api.setPin("1234");
  const pendingCommit = api.commit((db) => { db.settings.team = "Neu"; }, "gespeichert");
  await delay(0);
  api.commitAvailability("occ-1", "c1", "confirmed", "");
  await delay(0);
  assert.equal(held.length, 1);
  assert.equal(stats().maxInflight, 1);
  assert.match(api.html(), /noch nicht gespeichert/);
  await api.refresh();
  assert.equal(held.length, 1);

  held[0].resolve(await held[0].run());
  assert.equal(await pendingCommit, true);
  await settled();
  assert.equal(held.length, 2);
  assert.equal(held[0].body.render, "all");
  assert.equal(held[1].body.render, "planning");
  held[1].resolve(await held[1].run());
  await settled();
  assert.equal(api.get().pending.length, 0);
  assert.equal(api.get().db.availability["occ-1"].c1.status, "confirmed");
  assert.equal(api.get().db.settings.team, "Neu");
  assert.equal(stats().maxInflight, 1);
  assert.equal(api.html().includes("noch nicht gespeichert"), false);
});

test("a late load cannot roll back and pending blocks refresh", async () => {
  let loadResult = { ok: true, state: sample({ rev: 2, settings: { ...sample().settings, team: "Server" } }), sheetUrl: "" };
  const { dom, api } = loadApp({
    onFetch(body) {
      if (body.action === "load") return loadResult;
      return { ok: true, rev: (body.rev || 0) + 1 };
    }
  });
  api.loadDB(sample({ rev: 5, settings: { ...sample().settings, team: "Lokal" } }));
  api.setPin("1234");
  api.setRev(5);
  await api.refresh();
  assert.equal(api.get().db.settings.team, "Lokal");
  loadResult = { ok: true, state: sample({ rev: 6, settings: { ...sample().settings, team: "Server" } }), sheetUrl: "" };
  await api.refresh();
  assert.equal(api.get().db.settings.team, "Server");

  api.setPending([{ occId: "occ-1", coachId: "c1", status: "declined", reason: "krank" }]);
  api.render();
  assert.match(api.html(), /noch nicht gespeichert/);
  loadResult = { ok: true, state: sample({ rev: 9, settings: { ...sample().settings, team: "Darf nicht" } }), sheetUrl: "" };
  await api.refresh();
  assert.equal(api.get().db.settings.team, "Server");
  assert.equal(dom.window.sessionStorage.getItem("tp.avail.t").includes("krank"), true);
});

test("conflict keeps pending answers and a failed save restores the previous state", async () => {
  let phase = "conflict";
  const server = sample({ rev: 8, settings: { ...sample().settings, team: "Server" } });
  const { api } = loadApp({
    onFetch(body) {
      if (body.action !== "save") return { ok: true, state: server, sheetUrl: "" };
      if (phase === "conflict" && body.render === "all") {
        phase = "done";
        return { ok: false, error: "conflict", state: server };
      }
      if (phase === "busy" && body.render === "all") return { ok: false, error: "busy" };
      return { ok: true, rev: (body.rev || 0) + 1 };
    }
  });
  api.loadDB(sample({ rev: 4, settings: { ...sample().settings, team: "Lokal" } }));
  api.setPin("1234");
  api.setPending([{ occId: "occ-1", coachId: "c1", status: "confirmed", reason: "" }]);
  const ok = await api.commit((db) => { db.settings.team = "Zwischen"; }, "x");
  await settled();
  assert.equal(ok, false);
  assert.equal(api.get().db.settings.team, "Server");
  assert.equal(api.get().db.availability["occ-1"].c1.status, "confirmed");

  phase = "busy";
  api.loadDB(sample({ rev: 4, settings: { ...sample().settings, team: "Stabil" } }));
  api.setPin("1234");
  api.setPending([{ occId: "occ-2", coachId: "c1", status: "uncertain", reason: "" }]);
  const failed = await api.commit((db) => { db.settings.team = "Kaputt"; }, "x");
  await settled();
  assert.equal(failed, false);
  assert.equal(api.get().db.settings.team, "Stabil");
  assert.equal(api.get().db.availability["occ-2"].c1.status, "uncertain");
});

test("boot replays stored availability and settings reject a short or empty pin", async () => {
  let saves = 0;
  const state = sample({ rev: 2 });
  const { dom, api } = loadApp({
    prepare(window) {
      window.sessionStorage.setItem("tp.avail.t", JSON.stringify([{ occId: "occ-9", coachId: "c1", status: "confirmed", reason: "" }]));
      window.localStorage.setItem("tp.pin.t", "1234");
    },
    onFetch(body) {
      if (body.action === "save") {
        saves++;
        assert.equal(body.render, "planning");
        assert.equal(body.state.availability["occ-9"].c1.status, "confirmed");
        return { ok: true, rev: 3 };
      }
      return { ok: true, state, sheetUrl: "https://example.test/sheet" };
    }
  });
  await settled();
  assert.equal(api.get().unlocked, true);
  assert.equal(api.get().db.availability["occ-9"].c1.status, "confirmed");
  assert.equal(saves, 1);

  api.setAdmin(true);
  api.setUI({ view: "admin", adminTab: "settings" });
  api.render();
  assert.match(api.html(), /mindestens 4 Ziffern/);
  dom.window.document.getElementById("t-pin").value = "";
  const before = saves;
  api.act("savesettings");
  await settled();
  assert.equal(saves, before);
  assert.match(dom.window.document.body.textContent, /nicht leer/);

  dom.window.document.getElementById("t-pin").value = "12";
  api.act("savesettings");
  await settled();
  assert.equal(saves, before);
  assert.match(dom.window.document.body.textContent, /mindestens 4/);
});

test("a successful person edit closes the form and clearing the admin pin drops the session", async () => {
  let pinSent = "";
  const { dom, api } = loadApp({
    onFetch(body) {
      if (body.action === "save") {
        pinSent = body.state.settings.pin;
        return { ok: true, rev: (body.rev || 0) + 1 };
      }
      return { ok: true, state: sample(), sheetUrl: "" };
    }
  });
  api.loadDB(sample());
  api.setPin("1234");
  api.setAdmin(true);
  api.setUI({ view: "admin", adminTab: "players", edit: { kind: "players", id: "p1" } });
  api.render();
  dom.window.document.getElementById("e-first").value = "Nora";
  dom.window.document.getElementById("e-last").value = "Aebi";
  const button = dom.window.document.createElement("button");
  button.setAttribute("data-kind", "players");
  button.setAttribute("data-id", "p1");
  api.act("saveperson", button);
  await settled();
  assert.equal(api.get().ui.edit, null);
  assert.equal(api.get().db.players.find((p) => p.id === "p1").first, "Nora");
  assert.equal(api.html().includes('id="e-first"'), false);

  dom.window.sessionStorage.setItem("tp.admin.t", "99");
  api.setUI({ view: "admin", adminTab: "settings", edit: null });
  api.render();
  dom.window.document.getElementById("t-pin").value = "1234";
  dom.window.document.getElementById("t-apin").value = "";
  api.act("savesettings");
  await settled();
  assert.equal(pinSent, "1234");
  assert.equal(api.get().pin, "1234");
  assert.equal(dom.window.sessionStorage.getItem("tp.admin.t"), null);
});
