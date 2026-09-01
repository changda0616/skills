import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const AGENTS = {
  agy: {
    cmd: "agy",
    args: (promptPath) => [
      "--disable-slash-commands",
      "--model", "gemini-3.7-flash-high",
      "--effort", "high",
      "--output-format", "json",
      `-p=${readFileSync(promptPath, "utf8")}`,
    ],
    stdin: null,
    extract: (stdout) => {
      let envelope = null;
      for (const line of stdout.split("\n")) {
        const t = line.trim();
        if (t.startsWith('{"conversation_id"')) {
          try { envelope = JSON.parse(t); } catch {}
        }
      }
      if (!envelope) return { text: "", note: "no envelope" };
      return { text: envelope.response ?? "" };
    },
  },
  codex: {
    cmd: "codex",
    args: () => ["exec", "--json", "-"],
    stdin: (promptPath) => readFileSync(promptPath, "utf8"),
    extract: (stdout) => {
      let last = "";
      for (const line of stdout.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        let ev;
        try { ev = JSON.parse(t); } catch { continue; }
        if (ev.type !== "item.completed") continue;
        const text = ev.item?.text ?? "";
        if (text.trim()) last = text;
      }
      return { text: last };
    },
  },
};

function stripFence(s) {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : s.trim();
}

function jsonObjects(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf("{", i);
    if (start < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = start; j < s.length; j++) {
      const c = s[j];
      if (esc) { esc = false; continue; }
      if (c === "\\") { if (inStr) esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = j + 1; break; }
    }
    if (end < 0) break;
    try { out.push(JSON.parse(s.slice(start, end))); } catch {}
    i = end;
  }
  return out;
}

function run(agent, promptPath, timeoutMs) {
  const spec = AGENTS[agent];
  return new Promise((resolve) => {
    const child = spawn(spec.cmd, spec.args(promptPath), {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, reason: "spawn_failed", stderr: String(e.message) });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal === "SIGKILL") {
        return resolve({ ok: false, reason: "timeout", stderr: err.trim().slice(0, 2000) });
      }
      const { text, note } = spec.extract(out);
      const diag = [err.trim(), note].filter(Boolean).join(" | ").slice(0, 2000);
      if (!text.trim()) {
        return resolve({ ok: false, reason: "empty", exitCode: code, stderr: diag });
      }
      const objects = jsonObjects(stripFence(text));
      const answers = objects.filter((o) => o && o.status !== "waiting");
      if (!answers.length) {
        const waits = objects.filter((o) => o && o.status === "waiting");
        if (waits.length) {
          return resolve({
            ok: false, reason: "waiting", exitCode: code,
            stderr: [diag, waits[waits.length - 1].waiting_on].filter(Boolean).join(" | "),
          });
        }
        return resolve({
          ok: false, reason: "unparseable", exitCode: code,
          stderr: diag, raw: text.slice(0, 1000),
        });
      }
      resolve({ ok: true, data: answers[answers.length - 1], exitCode: code, stderr: diag });
    });
    if (spec.stdin) {
      child.stdin.write(spec.stdin(promptPath));
    }
    child.stdin.end();
  });
}

const [agent, promptPath, expectedIds, timeoutSec] = process.argv.slice(2);

if (!AGENTS[agent] || !promptPath) {
  console.log(JSON.stringify({
    ok: false, reason: "bad_usage",
    stderr: "usage: ask.mjs <agy|codex> <promptFile> [expectedIds|count] [timeoutSec]",
  }));
  process.exit(0);
}

const result = await run(agent, promptPath, (Number(timeoutSec) || 600) * 1000);

if (result.ok && expectedIds && expectedIds !== "-") {
  const items = result.data?.criteria;
  const fail = (reason, detail) => {
    console.log(JSON.stringify({ ok: false, agent, reason, stderr: detail, data: result.data }));
    process.exit(0);
  };
  if (!Array.isArray(items)) fail("shape_mismatch", "criteria is not an array");
  const got = items.map((c) => c.id);
  const dupes = got.filter((id, i) => got.indexOf(id) !== i);
  if (dupes.length) fail("duplicate_ids", `repeated: ${[...new Set(dupes)].join(", ")}`);
  if (/^\d+$/.test(expectedIds)) {
    const want = Number(expectedIds);
    if (got.length !== want) fail("count_mismatch", `criteria: got ${got.length}, want ${want}`);
  } else {
    const want = expectedIds.split(",").map((s) => s.trim()).filter(Boolean);
    const missing = want.filter((id) => !got.includes(id));
    const extra = got.filter((id) => !want.includes(id));
    if (missing.length || extra.length) {
      fail("id_mismatch", `missing: [${missing.join(", ")}] extra: [${extra.join(", ")}]`);
    }
  }
}

console.log(JSON.stringify({ ...result, agent }));
