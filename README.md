[![Competition](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/yourassisgood69/csv-reader-speed-v1/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/yourassisgood69/csv-reader-speed-v1/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

# csv-reader-speed-v1

A faster drop-in replacement for csv-reader 1.0.0. It reads broken CSV text
exactly the way csv-reader reads it — same columns, rows and errors for
every input — and does it faster.

The parser (`solve.js`, a dependency-free ES module) scans the text once,
left to right, with one index. Plain unquoted fields jump straight to the
next comma or line break with the engine's native substring search instead
of stepping character by character; only quoted fields and the rare broken
bits (stray carriage returns, doubled quotes, line breaks inside quotes,
junk after a closing quote, unterminated quotes) take the slow path.
Error bookkeeping costs nothing unless an error actually happens, and each
row is built directly with no strings or arrays made that are not needed.

`main.ts` is the program the harness runs: it reads the cases from
`/input/cases.json`, answers each one with `run`, and writes the answers
to `/output/answers.json`. It switches V8's incremental marking off
before loading the parser, so the collector does not interrupt the parse.

## How to run it

```sh
node main.ts
```

It reads `/input/cases.json` and writes `/output/answers.json`. Requires
Node 22.18 or later.
