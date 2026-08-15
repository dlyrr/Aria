// Move the version in every file that carries one, in lockstep.
//
// Four files disagree-able by hand: package.json, tauri.conf.json (what the
// installer and the About box report), Cargo.toml, and Cargo.lock's own entry
// for the crate. Missing the lock leaves the build dirtying a tracked file.
//
// Edits are targeted rather than parse-and-rewrite so the diff stays one line
// per file and no formatting is reflowed.

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const path = (rel) => fileURLToPath(new URL(rel, root));
const read = (rel) => readFileSync(path(rel), "utf8");

const SEMVER = /^\d+\.\d+\.\d+$/;

/** The next version, from an explicit `x.y.z` or a bump keyword. */
function next(current, spec) {
  if (SEMVER.test(spec)) return spec;
  const [major, minor, patch] = current.split(".").map(Number);
  if (spec === "major") return `${major + 1}.0.0`;
  if (spec === "minor") return `${major}.${minor + 1}.0`;
  if (spec === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`version must be x.y.z or patch/minor/major — got "${spec}"`);
}

/**
 * Replace the one version this file carries.
 *
 * The match is anchored per file rather than "first version-looking string":
 * Cargo.toml lists a version for every dependency, and only the one under
 * `[package]` is ours. Every edit asserts it found the version we expected, so
 * a file that drifted out of lockstep stops the release instead of shipping a
 * half-renamed build.
 */
function edit(rel, pattern, current, version) {
  const before = read(rel);
  const m = before.match(pattern);
  if (!m) throw new Error(`${rel}: no version field matched`);
  if (m[2] !== current) {
    throw new Error(`${rel}: version is ${m[2]}, expected ${current} — files are out of sync`);
  }
  writeFileSync(path(rel), before.replace(pattern, `$1${version}$3`));
  return `${rel}: ${current} -> ${version}`;
}

const spec = (process.argv[2] ?? "").trim();
const current = JSON.parse(read("package.json")).version;
if (!SEMVER.test(current)) {
  throw new Error(`package.json version "${current}" is not x.y.z`);
}

const version = next(current, spec);
if (version === current) throw new Error(`already at ${version}`);

const edits = [
  // Top-level "version" key. Both files put it in the first few lines, ahead of
  // any dependency map, so the first match is the package's own.
  edit("package.json", /("version"\s*:\s*")([^"]+)(")/, current, version),
  edit("src-tauri/tauri.conf.json", /("version"\s*:\s*")([^"]+)(")/, current, version),
  // Only the `[package]` version, never a dependency's.
  edit("src-tauri/Cargo.toml", /(\[package\][\s\S]*?\nversion = ")([^"]+)(")/, current, version),
  // The crate's own entry in the lock, keyed by name so it can't hit a dep.
  edit(
    "src-tauri/Cargo.lock",
    /(\[\[package\]\]\r?\nname = "Aria"\r?\nversion = ")([^"]+)(")/,
    current,
    version,
  ),
];

for (const line of edits) console.log(line);

// Consumed by the workflow to tag and to name the release.
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=v${version}\n`);
}
