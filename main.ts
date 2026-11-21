// Driver for the csv-reader-speed entry: reads every case from
// /input/cases.json, answers each one with run from solve.js, and writes
// the answers, one per case in the cases' order, to /output/answers.json.

import { setFlagsFromString } from 'node:v8';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// The harness mounts the cases at /input and expects answers at /output;
// under the process driver those mounts are stand-in directories named
// by these environment variables instead.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Switch V8's incremental marking off before the parser is loaded, so
// the collector does not pause the parse in small slices while the big
// texts are being read.
setFlagsFromString('--no-incremental-marking');

const { run } = await import('./solve.js');

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = cases.map((c) => run(c.input));
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
