/* eslint-env node */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const targetExtensions = new Set(['.js', '.mjs']);

const logInfo = (...args) => {
  const line = args
    .map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)))
    .join(' ');
  process.stdout.write(`${line}\n`);
};

const functionPatterns = [
  /(?:export\s+)?function\s+([\w$]+)/g,
  /(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/g
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...(await walk(fullPath)));
    } else if (targetExtensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

async function analyze() {
  const files = await walk(projectRoot);
  const duplicatesWithinFile = [];
  const globalOccurrences = new Map();

  for (const file of files) {
    const rawContent = await fs.readFile(file, 'utf8');
    const content = rawContent
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const counts = new Map();

    for (const pattern of functionPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (!name) continue;
        const current = counts.get(name) ?? 0;
        counts.set(name, current + 1);

        const byFile = globalOccurrences.get(name) ?? [];
        byFile.push(file);
        globalOccurrences.set(name, byFile);
      }
    }

    const dups = [...counts.entries()].filter(([, count]) => count > 1);
    if (dups.length > 0) {
      duplicatesWithinFile.push({ file, entries: dups });
    }
  }

  const duplicatesAcrossFiles = [];
  for (const [name, filesWithName] of globalOccurrences.entries()) {
    const uniqueFiles = [...new Set(filesWithName)];
    if (uniqueFiles.length > 1) {
      duplicatesAcrossFiles.push({ name, files: uniqueFiles });
    }
  }

  return { duplicatesWithinFile, duplicatesAcrossFiles };
}

analyze()
  .then(({ duplicatesWithinFile, duplicatesAcrossFiles }) => {
    logInfo('=== Duplicate function names within the same file ===');
    if (duplicatesWithinFile.length === 0) {
      logInfo('None found');
    } else {
      for (const { file, entries } of duplicatesWithinFile) {
        logInfo(`\n${path.relative(projectRoot, file)}`);
        for (const [name, count] of entries) {
          logInfo(`  ${name} -> ${count} occurrences`);
        }
      }
    }

    logInfo('\n=== Function names appearing across multiple files ===');
    const interestingGlobals = duplicatesAcrossFiles.filter(({ name }) => !['init', 'initialize', 'render', 'update', 'reset', 'setup', 'build'].includes(name));
    if (interestingGlobals.length === 0) {
      logInfo('Potential duplicates across files, inspect individually if needed.');
    } else {
      for (const { name, files } of interestingGlobals) {
        logInfo(`\n${name}`);
        for (const file of files) {
          logInfo(`  - ${path.relative(projectRoot, file)}`);
        }
      }
    }
  })
  .catch((error) => {
    console.error('Error during analysis:', error);
    process.exitCode = 1;
  });
