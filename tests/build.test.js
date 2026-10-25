'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { build } = require('../scripts/build.js');

test('bundle carries every part and the version from the manifest', () => {
  const out = build();
  assert.match(out.version, /^\d+\.\d+\.\d+$/);
  assert.ok(out.bundle.includes('var FBC_CSS'), 'styles');
  assert.ok(out.bundle.includes('root.FBC_CORE = factory()'), 'core');
  assert.ok(out.bundle.includes('root.FBC_I18N = factory()'), 'i18n');
  assert.ok(out.bundle.includes('window.__fbcLoaded = true'), 'content');
  assert.ok(out.userscript.startsWith('// ==UserScript=='));
  assert.ok(out.userscript.includes('// @match        https://www.instagram.com/*'));
  assert.ok(out.userscript.includes(`// @version      ${out.version}`));
  assert.ok(out.bookmarklet.startsWith('javascript:'));
  assert.ok(decodeURIComponent(out.bookmarklet.slice('javascript:'.length)).startsWith('window.FBC_HOST="bookmarklet";'));
});

test('bundle parses and exposes core and i18n without a DOM', () => {
  const out = build();
  const sandbox = { self: {}, console };
  sandbox.self.self = sandbox.self;
  // The content script returns early without window.top, so only the globals are checked here.
  sandbox.window = { top: {} };
  vm.runInNewContext(out.bundle, sandbox, { filename: 'checker.js' });
  assert.equal(typeof sandbox.self.FBC_CORE.derive, 'function');
  assert.equal(typeof sandbox.self.FBC_I18N.ar.fab, 'string');
});
