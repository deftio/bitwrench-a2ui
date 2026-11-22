// List uncovered lines, functions and branches from coverage/lcov.info, with source.
//   npm run test:coverage; node tools/uncovered.js [filter]
import { readFileSync } from 'node:fs';

const filter = process.argv[2] ?? '';
const lcov = readFileSync(new URL('../coverage/lcov.info', import.meta.url), 'utf8');
for (const rec of lcov.split('end_of_record')) {
  const file = /SF:(.*)/.exec(rec)?.[1];
  if (!file || !file.includes(filter)) continue;
  const src = readFileSync(file, 'utf8').split('\n');
  const hits = new Map();
  for (const m of rec.matchAll(/^DA:(\d+),(\d+)/gm)) if (m[2] === '0') hits.set(+m[1], 'line');
  for (const m of rec.matchAll(/^BRDA:(\d+),\d+,(\d+),(\d+|-)/gm)) if (m[3] === '0' || m[3] === '-') hits.set(+m[1], hits.get(+m[1]) ?? `branch ${m[2]}`);
  for (const m of rec.matchAll(/^FNDA:0,(.*)/gm)) console.log(`${file.split('/src/')[1]}: function never called: ${m[1]}`);
  for (const [line, kind] of [...hits].sort((a, b) => a[0] - b[0])) {
    console.log(`${file.split('/src/')[1]}:${line} [${kind}] ${src[line - 1]?.trim().slice(0, 150)}`);
  }
}
