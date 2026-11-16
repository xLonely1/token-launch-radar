// Token launch radar: the entrypoint (Node 22, standard library only).
//
// It reads the sealed snapshot (from /input/snapshot.json, or --input
// <file|directory>), scores every pre-token protocol with the model in
// lib/model.ts, and writes the entry's outputs: the ranked board (board.json),
// the dashboard's dataset (data.js), copies of dashboard/ and screenshots/,
// and the judge's dossier (dossier.json, built by the vendored make.fun library
// from the finished output directory).
//
// The dashboard itself is a static page with no framework and no network: it
// reads data.js, which is written from the same board the dossier summarizes,
// so the page and the board can never disagree.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { BoardRow, RadarData, Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The entrypoint's own caps: the text cap shapes the dossier's bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const MIN_SCREENSHOTS = 3;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const DEFAULT_INPUT = '/input';
const DEFAULT_OUTPUT = '/output';

/** Stop with a message on stderr and the given exit code. */
function fail(message: string, code: number): never {
  process.stderr.write(message);
  process.exit(code);
}

/** The value of `--name <value>` or `--name=<value>` in the arguments, if either is there. */
function readFlag(name: string): string | undefined {
  const argv = process.argv;
  const at = argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1];
  const withEquals = argv.find((a) => a.startsWith(`--${name}=`));
  if (withEquals !== undefined) return withEquals.slice(name.length + 3);
  return undefined;
}

/** A flag's value, or the fallback when the flag is absent. */
function flag(name: string, fallback: string): string {
  return readFlag(name) ?? fallback;
}

/** The snapshot file for an --input value: the file itself, or snapshot.json inside a directory. */
function resolveSnapshotPath(inputArg: string): string {
  return inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
}

/** The parsed snapshot, or exit 2 when its file is not there. */
function loadSnapshot(inputFile: string): Snapshot {
  if (!existsSync(inputFile)) {
    fail(
      `token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
      2,
    );
  }
  return parseSnapshot(readFileSync(inputFile, 'utf8'));
}

/** The board and the dashboard data for a snapshot, or exit 1 when the gate refuses the board. */
function scoreSnapshot(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    fail(`token radar: the model wrote a board the gate refuses: ${issue}\n`, 1);
  }
  return { board, radar };
}

/** The ranked board and the dashboard dataset, written into the output directory. */
function writeBoard(out: string, board: BoardRow[], radar: RadarData): void {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** The screenshots a hand-in needs: at least three, each with a gate-legal name. */
function checkScreenshots(shots: string[]): void {
  if (shots.length < MIN_SCREENSHOTS) {
    fail(
      `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
      1,
    );
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      fail(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`, 1);
    }
  }
}

/** The dossier, written last: the scorer rebuilds it from this /output and compares bytes. */
function writeDossier(out: string): void {
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
  );
}

/** The run's two summary lines on stdout. */
function printSummary(snapshot: Snapshot, board: BoardRow[], radar: RadarData, out: string, shots: string[]): void {
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

const inputArg = flag('input', DEFAULT_INPUT);
const inputFile = resolveSnapshotPath(inputArg);
const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT);
const snapshot = loadSnapshot(inputFile);
const { board, radar } = scoreSnapshot(snapshot);
writeBoard(out, board, radar);
copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
checkScreenshots(shots);
writeDossier(out);
printSummary(snapshot, board, radar, out, shots);
