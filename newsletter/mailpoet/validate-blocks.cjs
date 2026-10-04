require('global-jsdom/register');
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
const fs = require('fs');
const blocks = require('@wordpress/blocks');
require('@wordpress/block-library').registerCoreBlocks();
const parsed = blocks.parse(fs.readFileSync(process.argv[2], 'utf8'));
let bad = 0, n = 0;
(function walk(list) { for (const b of list) { n++;
  if (!b.isValid && b.name) { bad++; console.log('INVALID', b.name, JSON.stringify(b.validationIssues?.map(i=>i.args?.slice(1,3))).slice(0,1200)); }
  walk(b.innerBlocks || []); } })(parsed);
console.log(`blocks: ${n}, invalid: ${bad}`);
