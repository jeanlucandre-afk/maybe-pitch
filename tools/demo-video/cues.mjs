// Dump window.CUES of the demo page as JSON (sound cues: [time, type, param]).
import { serve } from './shoot.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright')); }
const srv = await serve(); const b = await chromium.launch(); const pg = await b.newPage();
await pg.goto(`http://localhost:${srv.address().port}/demo/${process.env.DEMO || 'layla'}/index.html?render&t=0`);
console.log(JSON.stringify(await pg.evaluate(() => window.CUES)));
await b.close(); srv.close();
