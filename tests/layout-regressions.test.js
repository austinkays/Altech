const fs = require('fs');
const path = require('path');
const { readComponentsCss, readIntakeAssistCss } = require('./helpers/css-loader.js');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('Layout Regression Guardrails', () => {
  const baseCss = read('css/base.css');
  const layoutCss = read('css/layout.css');
  const componentsCss = readComponentsCss();
  const sidebarCss = read('css/sidebar.css');
  const intakeCss = readIntakeAssistCss();
  const quoteCompareCss = read('css/quote-compare.css');

  test('global body prevents horizontal overflow bleed', () => {
    expect(baseCss).toContain('overflow-x: hidden;');
  });

  test('quoting tool no longer forces 100vh inside shell', () => {
    expect(layoutCss).toContain('#quotingTool.active { animation: pluginFadeInNoTransform 0.4s var(--transition-smooth) both; min-height: 100%; }');
    expect(layoutCss).not.toContain('#quotingTool.active { animation: pluginFadeInNoTransform 0.4s var(--transition-smooth) both; min-height: 100vh; }');
  });

  test('intake v2 uses no-transform animation so sticky rails + fixed FAB compute against the viewport', () => {
    // The default .plugin-container.active animation is `pluginFadeIn` which
    // ends on `transform: translateY(0)`. With animation-fill-mode: both, the
    // transform persists, creating a new containing block — that kills
    // position:sticky on .iv2-left-rail / .iv2-right-rail and re-anchors
    // position:fixed on .iv2-fab to the workspace bottom instead of the
    // viewport. Same fix the quoting tool already uses.
    expect(layoutCss).toContain('#intakeV2Tool.active { animation: pluginFadeInNoTransform 0.4s var(--transition-smooth) both; min-height: 100%; }');
  });

  test('intake v2 rails are sticky with z-index + solid background so they ride above the form during scroll', () => {
    // The rails pin Quick Start (left) + Talk Track (right) to the top of the
    // viewport while the agent scrolls. They need (a) position: sticky for the
    // pin behavior, (b) z-index > 0 so the form card shadows don't bleed over
    // them, and (c) a solid background so the scrolling content doesn't show
    // through. We pull the whole intake-v2.css and assert the rule body
    // contains all three.
    const intakeV2Css = read('css/intake-v2.css');
    const railRule = intakeV2Css.match(/\.iv2-left-rail,\s*\.iv2-right-rail\s*\{([\s\S]+?)\}/);
    expect(railRule).not.toBeNull();
    const body = railRule[1];
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/top:\s*72px/);
    expect(body).toMatch(/z-index:\s*\d+/);
    expect(body).toMatch(/background:\s*var\(--bg-card\)/);
  });

  test('intake-assist viewport overflow:hidden is scoped — does NOT leak to other plugins', () => {
    // The bare `#pluginViewport.plugin-viewport.active { overflow:hidden }`
    // rule from intake-assist-chat.css was being applied to EVERY plugin,
    // including intake-v2. That `overflow:hidden` on an ancestor of
    // .iv2-left-rail / .iv2-right-rail was killing position:sticky silently —
    // the rails would scroll off with the rest of the page.
    const { readIntakeAssistCss } = require('./helpers/css-loader.js');
    const intakeAssistCss = readIntakeAssistCss();
    // The unscoped form is now forbidden. (Match anything starting with #pluginViewport
    // without the :has(...) guard.)
    expect(intakeAssistCss).not.toMatch(/^#pluginViewport\.plugin-viewport\.active\s*\{/m);
    // The replacement scopes the rule to intake-assist's `#intakeTool` only.
    expect(intakeAssistCss).toContain('.app-shell:has(#intakeTool.active) #pluginViewport.plugin-viewport.active');
  });

  test('app-main has min-width guard and explicit background', () => {
    expect(sidebarCss).toContain('.app-main {');
    expect(sidebarCss).toContain('min-width: 0;');
    expect(sidebarCss).toContain('background: var(--bg);');
  });

  test('app-content is a flex column with min-height 0 to allow nested scrolling', () => {
    expect(sidebarCss).toContain('.app-content {');
    expect(sidebarCss).toContain('display: flex;');
    expect(sidebarCss).toContain('flex-direction: column;');
    expect(sidebarCss).toContain('min-height: 0;');
    expect(sidebarCss).toContain('min-width: 0;');
  });

  test('plugin viewport active state stretches and can shrink inside content area', () => {
    expect(sidebarCss).toContain('.plugin-viewport.active {');
    expect(sidebarCss).toContain('flex: 1;');
    expect(sidebarCss).toContain('min-height: 0;');
  });

  test('intake tool active container uses flex + min-height 0 instead of fixed height', () => {
    expect(intakeCss).toContain('#intakeTool.plugin-container.active {');
    expect(intakeCss).toContain('flex: 1 1 0%;');
    expect(intakeCss).toContain('min-height: 0;');
  });

  test('intake height chain includes plugin viewport containment and overflow guard', () => {
    expect(intakeCss).toContain('#pluginViewport.plugin-viewport.active {');
    expect(intakeCss).toContain('display: flex;');
    expect(intakeCss).toContain('flex-direction: column;');
    expect(intakeCss).toContain('overflow: hidden;');
  });

  test('intake layout root has min-height 0 for nested flex scroll behavior', () => {
    expect(intakeCss).toContain('.ia-layout {');
    expect(intakeCss).toContain('height: 100%;');
    expect(intakeCss).toContain('min-height: 0;');
  });

  test('quote compare chat body uses responsive clamp and min-height 0', () => {
    expect(quoteCompareCss).toContain('.qc-chat-body {');
    expect(quoteCompareCss).toContain('height: clamp(320px, 56dvh, 520px);');
    expect(quoteCompareCss).toContain('min-height: 0;');
  });

  test('quote compare message pane has min-height 0 + overflow-y auto', () => {
    expect(quoteCompareCss).toContain('.qc-chat-messages {');
    expect(quoteCompareCss).toContain('min-height: 0;');
    expect(quoteCompareCss).toContain('overflow-y: auto;');
  });
});
