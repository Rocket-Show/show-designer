// The minimum coverage of the specs (check in karma.conf.js) only goes up, and stays a margin below what the specs
// reach, so that a change with fewer specs than the rest still passes. After a run with --code-coverage,
//   node projects/designer/coverage-ratchet.mjs          raises it to the margin below what the specs reach now
//   node projects/designer/coverage-ratchet.mjs --check  only tells (in CI), where it is behind by more than a percent
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const configFile = here + 'karma.conf.js';
const summaryFile = here + '../../coverage/designer/coverage-summary.json';
const kinds = ['statements', 'branches', 'functions', 'lines'];
// in whole percents
const margin = 2;

const config = readFileSync(configFile, 'utf8');
const minimum = /global: \{ statements: (\d+), branches: (\d+), functions: (\d+), lines: (\d+) \}/;
const match = config.match(minimum);

if (!match) {
  throw new Error('The minimum coverage is not in ' + configFile);
}

const total = JSON.parse(readFileSync(summaryFile, 'utf8')).total;
const floors = Object.fromEntries(kinds.map((kind, index) => [kind, Number(match[index + 1])]));
const reached = Object.fromEntries(kinds.map((kind) => [kind, Math.floor(total[kind].pct)]));
const wanted = Object.fromEntries(kinds.map((kind) => [kind, reached[kind] - margin]));

if (process.argv.includes('--check')) {
  const behind = kinds.filter((kind) => wanted[kind] > floors[kind] + 1);

  if (behind.length > 0) {
    const what = behind.map((kind) => `${kind} ${floors[kind]} → ${wanted[kind]}`).join(', ');
    console.log(`::warning::The minimum coverage is behind what the specs reach (${what}): run npm run coverage:ratchet`);
  }
} else {
  const raised = Object.fromEntries(kinds.map((kind) => [kind, Math.max(floors[kind], wanted[kind])]));
  const line = `global: { ${kinds.map((kind) => `${kind}: ${raised[kind]}`).join(', ')} }`;

  writeFileSync(configFile, config.replace(minimum, line));
  console.log('The minimum coverage is ' + line.slice('global: '.length));
}
