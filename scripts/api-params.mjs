// Builds src/data/apiParams.json from the full MSF API spec, for the API tab's parameter form.
// Usage: node scripts/api-params.mjs /path/to/msf-api-spec.json
import fs from 'fs';

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shared = spec.components?.parameters ?? {};
const out = {};
for (const [path, item] of Object.entries(spec.paths)) {
  const op = item.get;
  if (!op) continue;
  const params = [...(op.parameters ?? []), ...(item.parameters ?? [])].map((p) => {
    const x = p.$ref ? shared[p.$ref.split('/').pop()] : p;
    const s = x.schema ?? {};
    return Object.fromEntries(Object.entries({
      name: x.name, in: x.in, enum: s.enum, default: s.default, type: s.type, required: x.required || undefined,
      description: (x.description ?? '').replace(/\s+/g, ' ').slice(0, 220) || undefined,
    }).filter(([, v]) => v !== undefined && v !== null));
  });
  out[path] = { summary: op.summary ?? '', params };
}
fs.writeFileSync('src/data/apiParams.json', JSON.stringify(out));
console.log(Object.keys(out).length, 'paths');
