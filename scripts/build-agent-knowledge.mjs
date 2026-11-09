// Joins the knowledge documents into one file for the n8n agent: docs/agent/knowledge.md
//   npm run build:agent-knowledge
//
// The agent gets all of it in every request (about 8k tokens, cached by the model), instead of searching
// it, because a missed search is how a bot ends up inventing an answer. The prices document is left out:
// prices come from the get_prices tool, so there is no second copy to go stale.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dir = path.join(root, 'docs/kumoda-support-agent');
const files = fs
  .readdirSync(dir)
  .filter((name) => /^kb-\d+.*\.md$/.test(name) && !name.startsWith('kb-09-'))
  .sort();

const parts = files.map((name) => fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n').trim());
const out = `# Knowledge\n\nPrices are not here: call get_prices. Links are in the Links part below.\n\n${parts.join('\n\n---\n\n')}\n`;
fs.writeFileSync(path.join(root, 'docs/agent/knowledge.md'), out);
console.log(`wrote docs/agent/knowledge.md (${files.length} documents, ${out.length} characters, about ${Math.round(out.length / 4)} tokens)`);
