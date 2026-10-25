// Panel styles. Injected into a shadow root by content.js, so Instagram's own CSS cannot leak in
// and a strict page CSP cannot block them (they go in through a constructed stylesheet).
var FBC_CSS = `
:host {
  all: initial;
  --bg: #FFFFFF; --bg2: #F3F5F7; --fg: #151D25; --muted: #5A6772; --border: #D8DEE4;
  --accent: #0E7C7B; --accent-ink: #FFFFFF; --accent-soft: #D9EFED;
  --danger: #A33A2A; --danger-soft: #F9E6E2; --shadow: rgba(0, 0, 0, 0.25);
  --good: #1E8E5A; --warn: #B26A00;
  --c1: #0A9A95; --c2: #7A52CC;
  font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--fg);
}
:host([data-theme="dark"]) {
  --bg: #161C22; --bg2: #0E1317; --fg: #E6EBEF; --muted: #94A0AB; --border: #2B353F;
  --accent: #4FC4BE; --accent-ink: #06211F; --accent-soft: #143836;
  --danger: #E9907F; --danger-soft: #3A1F1A; --shadow: rgba(0, 0, 0, 0.6);
  --good: #4CC38A; --warn: #E0A33C;
  --c1: #249C96; --c2: #9C7FE6;
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input, select { font: inherit; color: inherit; }

/* Bottom-right stack: the relationship pill (profile pages only) above the Follow check button.
   Sits above Instagram's own Messages tray, which occupies the bottom-right corner. */
.fabwrap { position: fixed; right: 20px; bottom: 96px; z-index: 2147483646; display: grid; justify-items: end; gap: 8px; max-width: min(440px, calc(100vw - 40px)); }
.fabwrap[dir="rtl"] { justify-items: start; }
.fab {
  background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 999px;
  padding: 10px 16px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 20px var(--shadow);
}
.fab:hover { filter: brightness(1.08); }
.rel {
  display: inline-flex; align-items: center; gap: 8px; max-width: 100%; text-align: start;
  background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 999px;
  padding: 7px 12px; font-size: 13px; cursor: pointer; box-shadow: 0 6px 20px var(--shadow);
}
.rel:hover { border-color: var(--accent); }
.rel b { font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-weight: 600; white-space: nowrap; direction: ltr; unicode-bidi: isolate; }
.rel .reltext { color: var(--muted); min-width: 0; overflow-wrap: anywhere; }
.rel.err .reltext { color: var(--danger); }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); flex: none; }
.dot.good { background: var(--good); }
.dot.warn { background: var(--warn); }
.dot.info { background: var(--accent); }
.dot.loading { background: var(--accent); animation: fbc-pulse 1s ease-in-out infinite; }
@keyframes fbc-pulse { 50% { opacity: 0.3; } }

.drawer {
  position: fixed; top: 0; right: 0; height: 100vh; width: 640px; max-width: 100vw; z-index: 2147483647;
  background: var(--bg); color: var(--fg); border-left: 1px solid var(--border);
  box-shadow: -12px 0 40px var(--shadow); display: flex; flex-direction: column;
}
.drawer.dragging { user-select: none; }
/* Left edge: drag to resize, double-click to reset. */
.grip { position: absolute; left: -3px; top: 0; bottom: 0; width: 8px; cursor: ew-resize; z-index: 1; }
.grip:hover, .drawer.dragging .grip { background: var(--accent); opacity: 0.6; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.headl { display: flex; align-items: baseline; gap: 8px; min-width: 0; flex-wrap: wrap; }
.headr { display: flex; align-items: center; gap: 4px; flex: none; }
.title { font-weight: 700; font-size: 16px; }
.me { color: var(--muted); font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 13px; direction: ltr; unicode-bidi: isolate; }
.icon { background: none; border: 0; font-size: 22px; line-height: 1; cursor: pointer; color: var(--muted); padding: 4px 8px; border-radius: 6px; }
.icon:hover { background: var(--bg2); color: var(--fg); }
.lang { background: none; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--muted); padding: 4px 8px; cursor: pointer; }
.lang:hover { border-color: var(--accent); color: var(--fg); }

.controls { display: flex; align-items: center; gap: 10px; padding: 12px 16px; flex-wrap: wrap; }
.status { color: var(--muted); font-size: 13px; flex: 1 1 auto; min-width: 0; }
.btn { border: 1px solid var(--border); background: var(--bg); color: var(--fg); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 500; }
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.btn.primary:disabled { opacity: 0.6; cursor: progress; }
.btn.small { padding: 5px 10px; font-size: 13px; }

.progress { padding: 0 16px 10px; display: grid; gap: 6px; }
.ptext { font-size: 13px; color: var(--muted); }
.pbar { height: 4px; background: var(--bg2); border-radius: 2px; overflow: hidden; }
.pfill { height: 100%; width: 0; background: var(--accent); transition: width 0.3s; }
.error { margin: 0 16px 10px; padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13px; }

.body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 16px 16px; display: grid; gap: 12px; align-content: start; }
.ledger { color: var(--muted); font-size: 13px; }
.ledger b { color: var(--fg); font-weight: 600; }

.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.tile { text-align: start; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: grid; gap: 2px; align-content: start; cursor: pointer; min-width: 0; }
.tile:hover { border-color: var(--accent); }
.tile[aria-selected="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.tile .label { font-size: 12px; line-height: 1.25; color: var(--muted); }
.tile[aria-selected="true"] .label { color: var(--accent); font-weight: 600; }
.tile .value { font-size: 24px; font-weight: 600; line-height: 1.15; overflow-wrap: anywhere; direction: ltr; unicode-bidi: isolate; }
.tile .value.small { font-size: 15px; line-height: 1.5; }
.tile .sub { font-size: 11px; line-height: 1.3; color: var(--muted); }
.drawer.narrow .tiles { grid-template-columns: repeat(2, 1fr); }

.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.field { flex: 1 1 140px; min-width: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; }
.field.sel { flex: 0 0 auto; width: auto; }
.chk { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; cursor: pointer; }
input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.listtitle { font-weight: 600; font-size: 14px; }

.list { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.list > * + * { border-top: 1px solid var(--border); }
.row { display: flex; gap: 10px; align-items: center; padding: 8px 12px; min-width: 0; }
.row.done { opacity: 0.5; }
.row.done .handle { text-decoration: line-through; }
.who { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; align-content: center; }
.handle { flex: none; font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 13.5px; font-weight: 500; color: var(--fg); text-decoration: none; overflow-wrap: anywhere; direction: ltr; unicode-bidi: isolate; }
.handle:hover { color: var(--accent); text-decoration: underline; }
.handle .arrow { color: var(--muted); font-size: 12px; margin-left: 4px; }
.name { min-width: 0; max-width: 100%; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.group { padding: 8px 12px 4px; font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg2); }
.chip { flex: none; font-size: 11px; border-radius: 999px; padding: 2px 8px; white-space: nowrap; border: 1px solid var(--border); color: var(--muted); }
.chip.good { color: var(--good); border-color: var(--good); }
.chip.warn { color: var(--warn); border-color: var(--warn); }
.chip.live { color: var(--fg); border-color: var(--accent); }
.avatar { flex: none; width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: var(--bg2); }
.avatar.ph { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: var(--muted); }
.tag.ver { color: var(--accent); border-color: var(--accent); }
.protect { flex: none; background: none; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; color: var(--muted); padding: 2px 7px; cursor: pointer; white-space: nowrap; }
.protect:hover { border-color: var(--accent); color: var(--fg); }
.protect.on { background: var(--accent-soft); border-color: var(--accent); color: var(--fg); }
.unf { flex: none; background: none; border: 1px solid var(--danger); border-radius: 6px; font-size: 11px; color: var(--danger); padding: 2px 7px; cursor: pointer; white-space: nowrap; }
.unf:hover { background: var(--danger-soft); }
.unf.arm { background: var(--danger); color: var(--bg); }
.unf:disabled { opacity: 0.6; cursor: progress; }
.modal { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.45); display: grid; place-items: center; z-index: 5; padding: 16px; }
.modal .box { background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; max-width: 380px; display: grid; gap: 10px; box-shadow: 0 12px 40px var(--shadow); }
.mtitle { font-weight: 700; font-size: 15px; }
.mtext { font-size: 13.5px; line-height: 1.5; }
.prot { display: grid; gap: 10px; }
.hint { font-size: 12.5px; color: var(--muted); }
.field.area { width: 100%; min-height: 64px; resize: vertical; font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 13px; direction: ltr; }
.verify { flex: none; background: none; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; color: var(--muted); padding: 2px 7px; cursor: pointer; white-space: nowrap; }
.verify:hover { border-color: var(--accent); color: var(--fg); }
.verify:disabled { opacity: 0.6; cursor: progress; }
.notice { padding: 8px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 12.5px; }
.empty { padding: 22px 12px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 10px; }

/* History chart: text in text tokens, series color only on the marks. */
.chart { position: relative; border: 1px solid var(--border); border-radius: 10px; padding: 8px 8px 6px; background: var(--bg); direction: ltr; }
.chart svg { display: block; width: 100%; height: auto; font-family: inherit; }
.chart .grid { stroke: var(--border); stroke-width: 1; }
.chart .ax { font-size: 11px; fill: var(--muted); }
.chart .lbl { font-size: 11px; font-weight: 600; fill: var(--fg); }
.chart .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.chart path.s1 { stroke: var(--c1); }
.chart path.s2 { stroke: var(--c2); }
.chart circle.s1 { fill: var(--c1); stroke: var(--bg); stroke-width: 2; }
.chart circle.s2 { fill: var(--c2); stroke: var(--bg); stroke-width: 2; }
.chart .cross { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; }
.cnote { padding: 14px 6px; color: var(--muted); font-size: 13px; text-align: center; }
.ctip { position: absolute; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 12px; line-height: 1.4; box-shadow: 0 6px 20px var(--shadow); pointer-events: none; width: 190px; }
.ctipd { color: var(--muted); margin-bottom: 2px; }
.legend { display: flex; gap: 14px; font-size: 12px; color: var(--muted); padding: 6px 4px 0; }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.legend .s1 { background: var(--c1); }
.legend .s2 { background: var(--c2); }

.foot { padding: 10px 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.toast { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); background: var(--fg); color: var(--bg); padding: 8px 14px; border-radius: 8px; font-size: 13px; box-shadow: 0 6px 20px var(--shadow); white-space: nowrap; }
.btn:focus-visible, .tile:focus-visible, .field:focus-visible, .icon:focus-visible, .lang:focus-visible, .handle:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .pfill { transition: none; } .dot.loading { animation: none; } }

/* Phones and the Android app: full-width panel, bigger targets, no resize grip. */
:host(.mobile) .fabwrap { right: 12px; bottom: 76px; max-width: calc(100vw - 24px); }
:host(.mobile) .grip { display: none; }
:host(.mobile) .drawer { width: 100vw; }
:host(.mobile) .btn { padding: 11px 16px; }
:host(.mobile) .btn.small { padding: 8px 12px; }
:host(.mobile) .row { padding: 11px 12px; flex-wrap: wrap; }
:host(.mobile) .who { flex-basis: 55%; }
:host(.mobile) input[type="checkbox"] { width: 20px; height: 20px; }
:host(.mobile) .tile { padding: 12px 10px; }
:host(.mobile) .head { padding: 12px 14px; }
:host(.mobile) .controls { padding: 10px 14px; }
:host(.mobile) .body { padding: 4px 12px 16px; }
:host(.mobile) .field { padding: 10px 12px; }
`;
