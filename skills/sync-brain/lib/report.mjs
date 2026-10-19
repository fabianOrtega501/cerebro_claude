/**
 * Informe crudo de lo que cambio en lo vigilado de un repo (su `.claude/`, o la rama de main-brain) frente a la ultima revision.
 * Uso: `node report.mjs [ruta-del-repo | clave-de-proyecto]`. No juzga ni mezcla: la clasificacion la hace Claude.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { changedFiles, fetchWatched, inspect, listFiles, liveFiles, readLive, resolveTarget, upstreamPaths, watchOf } from "../../../brain/lib/upstream.mjs";

const CLAUDE_DIR = join(homedir(), ".claude");

/** Parsed JSON file, or `fallback` if it is missing or invalid. */
function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  }
  catch {
    return fallback;
  }
}

/** File content, or `""` if it does not exist. */
function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Skill or agent a file belongs to: `name` in a repo `.claude/`, `plugin:name` in main-brain; `null` otherwise. */
function pieceOf(file, remote) {
  const match = remote
    ? file.match(/^plugins\/([^/]+)\/(?:skills\/([^/]+)\/|agents\/([^/]+)\.md$)/)
    : file.match(/^(?:skills\/([^/]+)\/|agents\/([^/]+)\.md$)/);

  if (!match)
    return null;

  return remote ? `${match[1]}:${match[2] ?? match[3]}` : match[1] ?? match[2];
}

/** Plugins installed here: those listed in `main-brain.json` plus the ones Claude Code reports for main-brain. */
function installedPlugins(config) {
  const registry = readJson(join(CLAUDE_DIR, "plugins", "installed_plugins.json"), {});
  const fromClaude = Object.keys(registry.plugins ?? {}).filter(k => k.endsWith("@main-brain")).map(k => k.split("@")[0]);

  return new Set([...(config.installed ?? []), ...fromClaude]);
}

/** Version, new CHANGELOG lines and install state of each plugin touched by the entries. */
function pluginSummary(repoRoot, snapshot, entries, config) {
  const installed = installedPlugins(config);
  const names = [...new Set(entries.map(e => e.file.match(/^plugins\/([^/]+)\//)?.[1]).filter(Boolean))];

  return names.map(name => {
    const manifest = `plugins/${name}/.claude-plugin/plugin.json`;
    const changelog = `plugins/${name}/CHANGELOG.md`;
    const before = new Set(read(join(snapshot, changelog)).split("\n"));

    return {
      plugin: name,
      installed: installed.has(name),
      version_before: JSON.parse(read(join(snapshot, manifest)) || "{}").version ?? null,
      version_now: JSON.parse(readLive(repoRoot, manifest) || "{}").version ?? null,
      changelog_added: readLive(repoRoot, changelog).split("\n").filter(l => l.trim() && !before.has(l)),
    };
  });
}

/** Own contributions with a commit already contained in the watched ref. */
function mergedContributions(repoRoot, ref, config) {
  return (config.contributions ?? []).filter(c => c.status === "pending" && c.commit).filter(c => {
    try {
      execFileSync("git", ["-C", repoRoot, "merge-base", "--is-ancestor", c.commit, ref], { stdio: "ignore" });

      return true;
    }
    catch {
      return false;
    }
  });
}

const repoRoot = resolveTarget(process.argv[2]);

if (!repoRoot) {
  console.error("No estas dentro de un repositorio git, ni el argumento es un proyecto con upstream.");
  process.exit(1);
}

const watch = watchOf(repoRoot);
const fetched = fetchWatched(repoRoot);
const { snapshot } = upstreamPaths(repoRoot);
const { status, since } = inspect(repoRoot);
const config = watch.remote ? readJson(join(CLAUDE_DIR, "brain", "main-brain.json"), {}) : {};
const entries = [];

for (const file of [...new Set([...liveFiles(repoRoot), ...listFiles(snapshot)])].sort()) {
  const now = readLive(repoRoot, file);
  const before = read(join(snapshot, file));

  if (now === before)
    continue;

  const piece = pieceOf(file, watch.remote);
  const equivalents = watch.remote ? config.equivalents?.[piece] ?? [] : [];

  entries.push({
    file,
    change: !before ? "added" : !now ? "removed" : "modified",
    piece,
    overridden_by_brain: watch.remote
      ? equivalents.length > 0
      : Boolean(piece && existsSync(join(CLAUDE_DIR, "skills", piece))),
    brain_equivalents: equivalents,
    bytes_now: Buffer.byteLength(now),
    bytes_before: Buffer.byteLength(before),
  });
}

console.log(JSON.stringify({
  repo: repoRoot,
  watch,
  fetched,
  status,
  reviewed_since: since,
  has_snapshot: existsSync(snapshot),
  git_changes: changedFiles(repoRoot, since),
  plugins: watch.remote ? pluginSummary(repoRoot, snapshot, entries, config) : undefined,
  merged_contributions: watch.remote ? mergedContributions(repoRoot, watch.ref, config) : undefined,
  entries,
}, null, 2));
