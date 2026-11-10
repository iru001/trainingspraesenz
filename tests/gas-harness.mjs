import fs from "node:fs";
import vm from "node:vm";

function createBook() {
  let nextId = 1;
  const sheets = [];
  const book = {
    failTmp: false,
    onSetValues: null,
    getUrl() { return "https://docs.google.com/spreadsheets/d/test"; },
    getSheets() { return sheets.slice(); },
    getSheetByName(name) { return sheets.find((s) => s._name === name) || null; },
    insertSheet(name) {
      const sh = makeSheet(name);
      sheets.push(sh);
      return sh;
    },
    deleteSheet(sh) {
      const i = sheets.indexOf(sh);
      if (i < 0) throw new Error("sheet missing");
      if (sheets.length <= 1) throw new Error("cannot delete the last sheet");
      sheets.splice(i, 1);
    }
  };

  function makeSheet(name) {
    const cells = [];
    const sheet = {
      _id: nextId++,
      _name: name,
      _hidden: false,
      _cells: cells,
      getSheetId() { return this._id; },
      getName() { return this._name; },
      setName(n) { this._name = n; },
      hideSheet() {
        const visible = sheets.filter((s) => !s._hidden);
        if (visible.length <= 1 && !this._hidden) throw new Error("cannot hide the last visible sheet");
        this._hidden = true;
      },
      clear() { cells.length = 0; },
      getLastRow() {
        for (let i = cells.length - 1; i >= 0; i--) {
          const row = cells[i] || [];
          if (row.some((c) => c !== "" && c != null)) return i + 1;
        }
        return 0;
      },
      getRange(row, col, numRows, numCols) {
        return {
          getValues() {
            const out = [];
            for (let i = 0; i < numRows; i++) {
              const line = [];
              for (let j = 0; j < numCols; j++) {
                const src = cells[row - 1 + i];
                line.push(src && src[col - 1 + j] != null ? src[col - 1 + j] : "");
              }
              out.push(line);
            }
            return out;
          },
          setValues(vals) {
            if (book.failTmp && sheet._name === "_daten_neu") {
              book.failTmp = false;
              throw new Error("setValues failed");
            }
            if (book.onSetValues) book.onSetValues(sheet._name, vals);
            for (let i = 0; i < vals.length; i++) {
              if (!cells[row - 1 + i]) cells[row - 1 + i] = [];
              for (let j = 0; j < vals[i].length; j++) cells[row - 1 + i][col - 1 + j] = vals[i][j];
            }
          },
          setFontWeight() {},
          setNumberFormat() {}
        };
      },
      setFrozenRows() {}
    };
    return sheet;
  }

  book.insertSheet("Tabelle1");
  return book;
}

function createLocks() {
  const held = { script: 0, document: 0 };
  function lock(kind) {
    return {
      waitLock() {
        if (held[kind] > 0) throw new Error("lock busy");
        held[kind]++;
      },
      releaseLock() {
        if (held[kind] > 0) held[kind]--;
      }
    };
  }
  return {
    getScriptLock: () => lock("script"),
    getDocumentLock: () => lock("document")
  };
}

function loadBackend() {
  const book = createBook();
  const props = {};
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book },
    LockService: createLocks(),
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
          setProperty(k, v) { props[k] = String(v); },
          deleteProperty(k) { delete props[k]; }
        };
      }
    },
    Utilities: { sleep() {} },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(s) { return { setMimeType() { return this; }, getContent: () => s }; }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), context, { filename: "Code.gs" });
  context.propsStore = props;
  context.bookStore = book;
  props.APP_PIN = "1234";
  props.ADMIN_PIN = "99";
  return {
    handle: (...args) => context.handle(...args),
    writeState: (...args) => context.writeState(...args),
    book,
    props,
    setChunk(n) { context.CHUNK = n; }
  };
}


export { loadBackend };
