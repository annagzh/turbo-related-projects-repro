import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = basename(dirname(fileURLToPath(import.meta.url)));
const raw = process.env.VERCEL_RELATED_PROJECTS;

const result = {
  app,
  VERCEL_RELATED_PROJECTS:
    raw === undefined
      ? "(undefined — the var was not set when this build actually executed)"
      : raw,
  present: raw !== undefined,
  builtAt: new Date().toISOString(),
};

console.log(`[${app}] VERCEL_RELATED_PROJECTS at build time:`, result.VERCEL_RELATED_PROJECTS);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

mkdirSync("dist", { recursive: true });
writeFileSync("dist/env.json", JSON.stringify(result, null, 2));
writeFileSync(
  "dist/index.html",
  `<!doctype html>
<meta charset="utf-8">
<title>${app}</title>
<h1>${app}</h1>
<p>Value of <code>VERCEL_RELATED_PROJECTS</code> observed by the turbo build task:</p>
<pre>${esc(JSON.stringify(result, null, 2))}</pre>
<p><a href="/env.json">env.json</a></p>
`
);
