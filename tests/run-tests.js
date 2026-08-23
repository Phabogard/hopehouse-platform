import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function findTestFiles(dir) {
  let results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

const testFiles = findTestFiles('dist/tests');
if (testFiles.length === 0) {
  console.error('Aucun fichier de test trouvé dans dist/tests');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
