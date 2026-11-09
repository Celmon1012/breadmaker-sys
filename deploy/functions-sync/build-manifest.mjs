// Runs at image build time. Reads supabase/functions/deploy-manifest.json, hashes each file, and writes:
//   <out>/manifest.txt   what the edge-functions container's sync.sh reads (plain text, so it needs no JSON tool)
//   <out>/manifest.json  the same, for people and for the future console
//   <out>/f/<path>       the files themselves
//
//   node build-manifest.mjs <functions dir> <out dir>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [, , source = './src-functions', out = './dist'] = process.argv;
const listed = JSON.parse(fs.readFileSync(path.join(source, 'deploy-manifest.json'), 'utf8')).files;
if (!Array.isArray(listed) || !listed.length) throw new Error('deploy-manifest.json lists no files');

fs.rmSync(out, { recursive: true, force: true });
const files = [];
for (const file of listed) {
  if (!/^[\w./-]+$/.test(file) || file.includes('..')) throw new Error(`Unsafe path in the manifest: ${file}`);
  // Files are served as the repo has them, with Unix line endings, so a checksum matches wherever the repo was checked out.
  const body = Buffer.from(fs.readFileSync(path.join(source, file), 'utf8').replace(/\r\n/g, '\n'), 'utf8');
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  fs.mkdirSync(path.join(out, 'f', path.dirname(file)), { recursive: true });
  fs.writeFileSync(path.join(out, 'f', file), body);
  files.push({ path: file, sha256, size: body.length });
}

// The version is a hash of every file's hash, so it changes exactly when the deployed content changes.
const version = crypto.createHash('sha256').update(files.map((f) => `${f.path}:${f.sha256}`).join('\n')).digest('hex').slice(0, 12);
const commit = (process.env.SOURCE_COMMIT || '').slice(0, 12);
const builtAt = new Date().toISOString();

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ version, commit, builtAt, files }, null, 2) + '\n');
fs.writeFileSync(
  path.join(out, 'manifest.txt'),
  [`version ${version}`, `commit ${commit || 'unknown'}`, `built ${builtAt}`, ...files.map((f) => `${f.sha256} ${f.size} ${f.path}`)].join('\n') + '\n',
);
console.log(`manifest ${version}: ${files.length} files${commit ? `, commit ${commit}` : ''}`);
