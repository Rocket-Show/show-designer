// Records what the designer makes of the conformance cases as their expected values (see README.md):
//
//   npm run conformance:record            (re)records the expected values of all cases
//   npm run conformance:record -- --index (only writes index.ts, e.g. after adding a profile)
//
// It writes index.ts (the case files and profiles the spec imports), runs conformance.spec.ts with
// Karma, collects what the spec sends back and writes it into the case files. Review the
// difference before committing it: Rocket Show has to come to exactly the same values.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, writeCaseFile } from './generate.mjs';

const conformance = dirname(fileURLToPath(import.meta.url));
const web = join(conformance, '..', '..', '..');
const casesDirectory = join(conformance, 'cases');
const profilesDirectory = join(conformance, 'profiles');

function jsonFiles(directory) {
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? jsonFiles(path) : name.endsWith('.json') ? [path] : [];
    });
}

function slash(path) {
  return path.split(sep).join('/');
}

function writeIndex() {
  const lines = ['// Written by record.mjs: the case files and the profiles of the fixture library the cases play.', ''];
  const caseEntries = [];
  const profileEntries = [];

  jsonFiles(casesDirectory).forEach((path, index) => {
    lines.push(`import case${index} from './${slash(relative(conformance, path))}';`);
    caseEntries.push(`  '${slash(relative(casesDirectory, path))}': case${index},`);
  });

  jsonFiles(profilesDirectory).forEach((path, index) => {
    lines.push(`import profile${index} from './${slash(relative(conformance, path))}';`);
    profileEntries.push(`  '${slash(relative(profilesDirectory, path)).replace(/\.json$/, '')}': profile${index},`);
  });

  lines.push('', 'export const caseFiles: { [fileName: string]: any } = {', ...caseEntries, '};');
  lines.push('', 'export const profiles: { [name: string]: any } = {', ...profileEntries, '};', '');
  writeFileSync(join(conformance, 'index.ts'), lines.join('\n'));
}

function prettier(...paths) {
  spawnSync('npx', ['prettier', '--write', ...paths], { cwd: web, stdio: 'inherit' });
}

if (!process.argv.includes('--index')) {
  generate();
}

writeIndex();
prettier(join(conformance, 'index.ts'));

if (process.argv.includes('--index')) {
  process.exit(0);
}

const recorded = {};

const server = createServer((request, response) => {
  let body = '';

  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    if (request.method === 'POST') {
      const { fileName, actuals } = JSON.parse(body);
      recorded[fileName] = actuals;
    }

    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    response.end();
  });
});

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  const test = spawn(
    'npx',
    ['ng', 'test', 'designer', '--watch=false', '--browsers=ChromeHeadlessCI', '--include=projects/designer/src/lib/conformance.spec.ts'],
    { cwd: web, stdio: 'inherit', env: { ...process.env, CONFORMANCE_RECORD_URL: url } }
  );

  test.on('exit', (code) => {
    server.close();

    if (code !== 0) {
      console.error('The designer could not run the cases');
      process.exit(code);
    }

    const written = [];

    for (const [fileName, actuals] of Object.entries(recorded)) {
      const path = join(casesDirectory, fileName);
      const caseFile = JSON.parse(readFileSync(path, 'utf8'));

      caseFile.cases.forEach((conformanceCase, index) => {
        conformanceCase.expected = actuals[index];
      });

      writeCaseFile(path, caseFile);
      written.push(path);
    }

    console.log(`Recorded ${written.length} case files`);
  });
});
