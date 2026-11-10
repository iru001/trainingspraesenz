import fs from "node:fs";
import http from "node:http";
import { loadBackend } from "./gas-harness.mjs";

const port = Number(process.env.PORT || 8765);
const gas = loadBackend();
const renders = [];
let failSaves = 0;

const html = fs.readFileSync(new URL("../docs/index.html", import.meta.url), "utf8").replace(
  '<script src="config.js"></script>',
  `<script>window.TP_CONFIG=${JSON.stringify({
    teams: [{ id: "t", name: "FA Test", apiUrl: `http://127.0.0.1:${port}/api` }]
  })};</script>`
);

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (e) { body = {}; }
      if (failSaves > 0 && body.action === "save") {
        failSaves--;
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("down");
        return;
      }
      const out = gas.handle(body);
      if (body.action === "save") renders.push(body.render || "all");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
    });
    return;
  }
  if (req.url === "/debug/fail-next") {
    failSaves++;
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.url === "/debug") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      renders,
      failSaves,
      sheets: gas.book.getSheets().map((s) => s.getName())
    }));
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`listening http://127.0.0.1:${port}`);
});
