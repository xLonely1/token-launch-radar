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
//
// Usage: node main.ts [--input <snapshot.json|directory>] [--output <directory>]
//   --help prints this usage and exits; --input defaults to /input, --output to
//   MAKEFUN_OUTPUT_DIR or /output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { BoardRow, RadarData, Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));

/** The entrypoint's own caps: the text cap shapes the dossier's bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const MIN_SCREENSHOTS = 3;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const DEFAULT_INPUT = '/input';
const DEFAULT_OUTPUT = '/output';

/** The dossier's own options, fixed for this competition. */
const DOSSIER_OPTIONS = { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS };

/** The usage text --help prints. */
const USAGE = [
  'token radar: usage: node main.ts [--input <snapshot.json|directory>] [--output <directory>]',
  'token radar: reads the sealed snapshot, scores every pre-token protocol, and writes board.json, data.js, dashboard/, screenshots/ and dossier.json',
].join('\n');

/** Stop with a message on stderr and the given exit code. */
function fail(message: string, code: number): never {
  process.stderr.write(message);
  process.exit(code);
}

/** Print the usage text and stop successfully. */
function printUsageAndExit(): never {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
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

/** The ranked board as board.json. */
function writeBoardJson(outputDir: string, board: BoardRow[]): void {
  writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
}

/** The dashboard's dataset as data.js. */
function writeDataScriptFile(outputDir: string, radar: RadarData): void {
  writeFileSync(join(outputDir, 'data.js'), dataScript(radar));
}

/** The ranked board and the dashboard dataset, written into the output directory. */
function writeBoard(outputDir: string, board: BoardRow[], radar: RadarData): void {
  mkdirSync(outputDir, { recursive: true });
  writeBoardJson(outputDir, board);
  writeDataScriptFile(outputDir, radar);
}

/** The regular files of one directory, skipping names that start with a dot. */
function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => !name.startsWith('.'));
}

/** Copy one regular file, skipping anything that is not a file. */
function copyOneFile(from: string, to: string, name: string): boolean {
  const path = join(from, name);
  if (!statSync(path).isFile()) return false;
  copyFileSync(path, join(to, name));
  return true;
}

/** Copy one directory's regular files into `to`, returning the names copied. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of listFiles(from)) {
    if (copyOneFile(from, to, name)) copied.push(name);
  }
  return copied;
}

/** The count a hand-in needs: at least three screenshots. */
function checkScreenshotCount(names: string[]): void {
  if (names.length < MIN_SCREENSHOTS) {
    fail(
      `token radar: screenshots/ holds ${names.length} image${names.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
      1,
    );
  }
}

/** Every screenshot's name must be one the gate accepts. */
function checkScreenshotNames(names: string[]): void {
  for (const name of names) {
    if (!IMAGE_NAME.test(name)) {
      fail(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`, 1);
    }
  }
}

/** The screenshots a hand-in needs: at least three, each with a gate-legal name. */
function checkScreenshots(shotNames: string[]): void {
  checkScreenshotCount(shotNames);
  checkScreenshotNames(shotNames);
}

/** The dossier, written last: the scorer rebuilds it from this /output and compares bytes. */
function writeDossier(outputDir: string): void {
  writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_OPTIONS));
}

/** The run's two summary lines on stdout. */
function printSummary(snapshot: Snapshot, board: BoardRow[], radar: RadarData, outputDir: string, shotNames: string[]): void {
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ${join(outputDir, 'dashboard')} (3 files), ${join(outputDir, 'screenshots')} (${shotNames.length} images) and ${join(outputDir, 'dossier.json')}\n`,
  );
}

if (process.argv.includes('--help') || process.argv.includes('-h')) printUsageAndExit();
const inputArg = flag('input', DEFAULT_INPUT);
const inputFile = resolveSnapshotPath(inputArg);
const outputDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT);
const snapshot = loadSnapshot(inputFile);
const { board, radar } = scoreSnapshot(snapshot);
writeBoard(outputDir, board, radar);
copyFiles(join(entryDir, 'dashboard'), join(outputDir, 'dashboard'));
const shotNames = copyFiles(join(entryDir, 'screenshots'), join(outputDir, 'screenshots'));
checkScreenshots(shotNames);
writeDossier(outputDir);
printSummary(snapshot, board, radar, outputDir, shotNames);
