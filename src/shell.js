// ─────────────────────────────────────────────────────
// Signal Bench kabuğu: tema, kenar çubuğu, komut paleti, kısayollar.
// app.js'e dokunmaz; yalnızca .nav-tab tıklamalarını ve mevcut butonları tetikler.
// ─────────────────────────────────────────────────────
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ── Sağdaki aksiyon butonlarını araç başlığına taşı (id ve olaylar korunur) ──
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const head = panel.querySelector('.toolhead'), right = panel.querySelector('.toolbar .btn-right');
    if (head && right) { right.classList.add('head-actions'); head.appendChild(right); }
  });

  // ── Tema: system → dark → light ──
  const mq = matchMedia('(prefers-color-scheme: light)');
  const THEME_LABEL = { system: 'Sistem', dark: 'Koyu', light: 'Açık' };
  const THEME_ICON = { system: 'ti-device-desktop', dark: 'ti-moon', light: 'ti-sun' };
  let themePref = store.get('dts-theme') || 'system';
  function applyTheme() {
    const t = themePref === 'system' ? (mq.matches ? 'light' : 'dark') : themePref;
    root.setAttribute('data-theme', t);
    const b = $('bTheme');
    if (b) { b.innerHTML = `<i class="ti ${THEME_ICON[themePref]}"></i>`; b.title = `Tema: ${THEME_LABEL[themePref]} (Ctrl Shift L)`; }
  }
  function cycleTheme() {
    themePref = { system: 'dark', dark: 'light', light: 'system' }[themePref];
    store.set('dts-theme', themePref); applyTheme();
    if (typeof toast === 'function') toast('Tema: ' + THEME_LABEL[themePref], 'var(--ink-100)');
  }
  mq.addEventListener('change', () => { if (themePref === 'system') applyTheme(); });
  applyTheme();
  $('bTheme').onclick = cycleTheme;

  // ── Kenar çubuğu ──
  const shell = $('shell');
  if (store.get('dts-rail') === '1') shell.classList.add('rail');
  function toggleRail() { const on = shell.classList.toggle('rail'); store.set('dts-rail', on ? '1' : '0'); }
  $('bSide').onclick = toggleRail;

  // ── Son açılan aracı hatırla ──
  const tabs = [...document.querySelectorAll('.nav-tab')];
  tabs.forEach(t => t.addEventListener('click', () => store.set('dts-tab', t.dataset.tab)));
  const lastTab = store.get('dts-tab');
  const startTab = tabs.find(t => t.dataset.tab === lastTab);
  if (startTab && !startTab.classList.contains('active')) startTab.click();
  function openTab(id) {
    const t = tabs.find(x => x.dataset.tab === id); if (!t) return;
    t.click();
    const panel = $('tab-' + id);
    const ta = panel && panel.querySelector('textarea:not([readonly])');
    if (ta) setTimeout(() => ta.focus(), 0);
  }
  const activeTab = () => (tabs.find(t => t.classList.contains('active')) || tabs[0]).dataset.tab;

  // ── Komut paleti ──
  const TOOLS = [
    { id: 'fmt', g: '{}', name: 'XML / JSON Formatter', hint: 'Biçimlendir · küçült · doğrula', kw: 'format json xml beautify minify validate pretty' },
    { id: 'diff', g: '±', name: 'Diff', hint: 'İki XML/JSON gövdesini karşılaştır', kw: 'diff compare karsilastir fark' },
    { id: 'gen', g: 'xsl', name: 'WSDL → XSL Generator', hint: 'WSDL’den XSLT mapping', kw: 'wsdl xsl xslt generator soap sap' },
    { id: 'req', g: 'req', name: 'XSL → Request', hint: 'XSLT’den örnek JSON/SOAP istek', kw: 'xsl request json soap sample postman' },
    { id: 'mip', g: 'zip', name: 'MIP Paketi', hint: 'Paket ZIP oluştur', kw: 'mip package paket zip flow' },
  ];
  const click = id => () => { const el = $(id); if (el && !el.disabled) el.click(); };
  const COMMANDS = [
    { name: 'Tema değiştir', icon: 'ti-contrast-2', k: 'Ctrl ⇧ L', run: cycleTheme },
    { name: 'Kenar çubuğunu daralt / genişlet', icon: 'ti-layout-sidebar', k: 'Ctrl B', run: toggleRail },
    { name: 'Formatter: Format', icon: 'ti-wand', k: 'Ctrl ↵', tab: 'fmt', run: click('f-format') },
    { name: 'Formatter: Minify', icon: 'ti-arrows-minimize', tab: 'fmt', run: click('f-minify') },
    { name: 'Formatter: Validate', icon: 'ti-shield-check', tab: 'fmt', run: click('f-validate') },
    { name: 'Diff: Karşılaştır', icon: 'ti-git-compare', k: 'Ctrl ↵', tab: 'diff', run: click('d-compare') },
    { name: 'XSL Generator: WSDL yükle', icon: 'ti-file-upload', tab: 'gen', run: click('g-load') },
    { name: 'XSL Generator: Ayarlar', icon: 'ti-settings', tab: 'gen', run: click('g-settings') },
    { name: 'XSL → Request: XSL yükle', icon: 'ti-file-upload', tab: 'req', run: click('r-loadXsl') },
    { name: 'MIP: ZIP oluştur & indir', icon: 'ti-package-export', tab: 'mip', run: click('mip-generate') },
  ];
  const pal = $('pal'), scrim = $('palScrim'), input = $('palInput'), list = $('palList');
  let items = [], idx = 0, lastFocus = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lc = s => s.toLocaleLowerCase('tr-TR');
  function score(text, q) {
    if (!q) return 1; const h = lc(text);
    if (h.startsWith(q)) return 3; if (h.includes(q)) return 2;
    let i = 0; for (const c of h) { if (c === q[i]) i++; if (i === q.length) return 1; } return 0;
  }
  function hl(name, q) {
    const i = q ? lc(name).indexOf(q) : -1;
    return i < 0 ? esc(name) : esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
  }
  function detect(raw) {
    const s = raw.trim();
    if (/^(<\?xml|<\w+:?\w*[\s>])/.test(s) && /wsdl:definitions|<definitions/i.test(s)) return 'gen';
    if (/^<xsl:|xsl:stylesheet/.test(s)) return 'req';
    if (/^[{\[<]/.test(s)) return 'fmt';
    return null;
  }
  function render() {
    const q = lc(input.value.trim());
    const tools = TOOLS.map(t => ({ t, s: Math.max(score(t.name, q), score(t.kw, q) ? 1 : 0) })).filter(x => x.s).sort((a, b) => b.s - a.s);
    const cmds = COMMANDS.filter(c => score(c.name, q));
    items = []; let html = '';
    const sniff = detect(input.value);
    if (sniff) {
      const t = TOOLS.find(x => x.id === sniff);
      html += '<div class="pal-group label">Algılandı</div>';
      html += row({ kind: 'paste', t }, `<span class="glyph">${esc(t.g)}</span><span>${esc(t.name)}’a yapıştır</span><span class="hint">${esc(input.value.trim().slice(0, 40))}…</span>`);
    }
    if (tools.length) { html += '<div class="pal-group label">Araçlar</div>'; tools.forEach(({ t }) => { html += row({ kind: 'tool', t }, `<span class="glyph">${esc(t.g)}</span><span>${hl(t.name, q)}</span><span class="hint">${esc(t.hint)}</span><span class="end"><kbd class="kbd">Ctrl ${TOOLS.indexOf(t) + 1}</kbd></span>`); }); }
    if (cmds.length) { html += '<div class="pal-group label">Komutlar</div>'; cmds.forEach(c => { html += row({ kind: 'cmd', c }, `<i class="ti ${c.icon}"></i><span>${hl(c.name, q)}</span><span class="end">${c.k ? `<kbd class="kbd">${c.k}</kbd>` : ''}</span>`); }); }
    if (!items.length) html = `<div class="pal-empty">“${esc(input.value)}” için sonuç yok. <b>format</b>, <b>diff</b>, <b>wsdl</b> veya <b>mip</b> dene.</div>`;
    idx = Math.min(idx, Math.max(items.length - 1, 0));
    list.innerHTML = html;
    list.querySelectorAll('.pal-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      el.onmouseenter = () => { idx = i; mark(); };
      el.onclick = () => run(i);
    });
  }
  function row(item, inner) { items.push(item); return `<button class="pal-item" role="option">${inner}</button>`; }
  function mark() { list.querySelectorAll('.pal-item').forEach((el, i) => { el.classList.toggle('active', i === idx); el.setAttribute('aria-selected', i === idx); if (i === idx) el.scrollIntoView({ block: 'nearest' }); }); }
  function run(i) {
    const it = items[i]; if (!it) return;
    const raw = input.value; close();
    if (it.kind === 'tool') openTab(it.t.id);
    else if (it.kind === 'paste') {
      openTab(it.t.id);
      const ta = { fmt: 'f-input', gen: 'g-wsdl', req: 'r-input' }[it.t.id];
      if (ta) { $(ta).value = raw; $(ta).dispatchEvent(new Event('input', { bubbles: true })); $(ta).dispatchEvent(new Event('keyup', { bubbles: true })); }
    } else { if (it.c.tab && it.c.tab !== activeTab()) openTab(it.c.tab); setTimeout(it.c.run, 0); }
  }
  function open() { lastFocus = document.activeElement; pal.hidden = false; scrim.hidden = false; input.value = ''; idx = 0; render(); input.focus(); }
  function close() { pal.hidden = true; scrim.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  input.addEventListener('input', () => { idx = 0; render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % Math.max(items.length, 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % Math.max(items.length, 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
  });
  scrim.onclick = close;
  $('paletteOpen').onclick = open;

  // ── Global kısayollar ──
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'k') { e.preventDefault(); pal.hidden ? open() : close(); return; }
    if (e.key === 'Escape') {
      if (!pal.hidden) { close(); return; }
      const sd = $('settingsDrawer'); if (sd && sd.classList.contains('open')) { sd.classList.remove('open'); return; }
    }
    if (!pal.hidden) return;
    if (mod && e.shiftKey && k === 'l') { e.preventDefault(); cycleTheme(); return; }
    if (mod && !e.shiftKey && k === 'b') { e.preventDefault(); toggleRail(); return; }
    if (mod && /^[1-5]$/.test(e.key)) { e.preventDefault(); openTab(TOOLS[+e.key - 1].id); return; }
  });
})();
