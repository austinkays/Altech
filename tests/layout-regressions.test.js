const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('Layout Regression Guardrails', () => {
  const mainCss = read('css/main.css');
  const sidebarCss = read('css/sidebar.css');
  const intakeCss = read('css/intake-assist.css');
  const quoteCompareCss = read('css/quote-compare.css');

  test('global body prevents horizontal overflow bleed', () => {
    expect(mainCss).toContain('overflow-x: hidden;');
  });

  test('quoting tool no longer forces 100vh inside shell', () => {
    expect(mainCss).toContain('#quotingTool.active { animation: pluginFadeInNoTransform 0.4s var(--transition-smooth) both; min-height: 100%; }');
    expect(mainCss).not.toContain('#quotingTool.active { animation: pluginFadeInNoTransform 0.4s var(--transition-smooth) both; min-height: 100vh; }');
  });

  test('policy Q&A chat uses responsive height clamp + inner scroll shrink guard', () => {
    expect(mainCss).toContain('height: clamp(320px, 56dvh, 520px);');
    expect(mainCss).toContain('.qna-messages { flex: 1; min-height: 0; overflow-y: auto;');
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
    expect(intakeCss).toContain('flex: 1;');
    expect(intakeCss).toContain('min-height: 0;');
  });

  test('intake height chain includes plugin viewport containment and overflow guard', () => {
    expect(intakeCss).toContain('.app-shell:has(#intakeTool.active) .plugin-viewport {');
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
