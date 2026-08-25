import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectCodeLanguage } from './code-language.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postsRoot = path.join(projectRoot, 'src', 'content', 'posts');
const checkOnly = process.argv.includes('--check');
const directories = await readdir(postsRoot, { withFileTypes: true });
const counts = new Map();
let filesChanged = 0;
let blocksChanged = 0;

for (const directory of directories) {
  if (!directory.isDirectory()) continue;
  const filename = path.join(postsRoot, directory.name, 'index.md');
  let source;
  try {
    source = await readFile(filename, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }

  const lines = source.split('\n');
  let open = null;
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const fence = lines[index].match(/^```(.*)$/);
    if (!fence) {
      if (open) open.content.push(lines[index]);
      continue;
    }

    if (!open) {
      open = { index, info: fence[1].trim(), content: [] };
      continue;
    }

    if (!open.info) {
      const language = detectCodeLanguage(open.content.join('\n'));
      counts.set(language, (counts.get(language) || 0) + 1);
      if (!checkOnly) lines[open.index] = `\`\`\`${language}`;
      blocksChanged += 1;
      changed = true;
    }
    open = null;
  }

  if (open) throw new Error(`${filename}:${open.index + 1} 닫히지 않은 코드블록`);
  if (changed) {
    filesChanged += 1;
    if (!checkOnly) await writeFile(filename, lines.join('\n'), 'utf8');
  }
}

console.log(`코드블록 ${blocksChanged}개 / 게시글 ${filesChanged}개 ${checkOnly ? '점검' : '변환'}`);
console.log([...counts].sort((a, b) => b[1] - a[1]).map(([language, count]) => `${language}: ${count}`).join('\n'));
