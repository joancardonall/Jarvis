import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const dir of ['src', 'scripts', 'tests']) {
  for (const file of readdirSync(dir).filter(file => file.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
console.log('JavaScript syntax: PASS');

// Check only local Markdown targets; never fetch external links or process node_modules.
const { readFileSync, existsSync } = await import('node:fs');
const { dirname, resolve } = await import('node:path');
function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
  });
}
const documents = ['README.md', 'AGENTS.md', ...markdownFiles('docs'), ...markdownFiles('prompts')];
for (const file of documents) {
  const markdown = readFileSync(file, 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:\/\//i.test(target)) continue;
    if (!existsSync(resolve(dirname(file), target))) {
      console.error(`Broken Markdown link: ${file} -> ${target}`);
      process.exitCode = 1;
    }
  }
}
if (!process.exitCode) console.log('Local Markdown links: PASS');
