// Builds the single-file bundle used by the Android app, the userscript and the bookmarklet
// from the extension sources. Run: npm run build
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const REPO = 'https://github.com/devbn3li/follow-back-checker';
const RAW = 'https://raw.githubusercontent.com/devbn3li/follow-back-checker/main/dist';

function build() {
  const manifest = JSON.parse(read('extension/manifest.json'));
  const version = manifest.version;
  const parts = ['styles.js', 'core.js', 'i18n.js', 'content.js'].map((f) => read('extension/' + f));
  const banner = `/* Follow Back Checker ${version}. Built from extension/ by scripts/build.js; do not edit by hand. ${REPO} */\n`;
  const bundle = banner + `if (typeof window !== 'undefined') window.FBC_VERSION = '${version}';\n` + parts.join('\n;\n');
  const userscript = [
    '// ==UserScript==',
    '// @name         Follow Back Checker',
    `// @namespace    ${REPO}`,
    `// @version      ${version}`,
    '// @description  Who you follow that does not follow you back, from your own logged-in instagram.com session. Nothing leaves the browser.',
    '// @author       devbn3li',
    '// @match        https://www.instagram.com/*',
    '// @grant        none',
    '// @run-at       document-idle',
    `// @updateURL    ${RAW}/follow-back-checker.user.js`,
    `// @downloadURL  ${RAW}/follow-back-checker.user.js`,
    '// ==/UserScript==',
    '',
    bundle,
  ].join('\n');
  const bookmarklet = 'javascript:' + encodeURIComponent('window.FBC_HOST="bookmarklet";' + bundle);
  return { version, bundle, userscript, bookmarklet };
}

function write(rel, text) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

if (require.main === module) {
  const out = build();
  const written = [
    write('dist/checker.js', out.bundle),
    write('dist/follow-back-checker.user.js', out.userscript),
    write('dist/bookmarklet.txt', out.bookmarklet),
    write('android/app/src/main/assets/checker.js', out.bundle),
  ];
  for (const p of written) console.log('wrote', path.relative(root, p), fs.statSync(p).size, 'bytes');
}

module.exports = { build };
