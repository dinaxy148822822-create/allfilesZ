'use strict';

/* =============================================================================
   allfilesZ — renderer application
   ========================================================================== */

const api = window.allfilesZ;
const I18N = window.I18N;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  settings: {},
  appInfo: {},
  tools: {},
  outDir: null,
  page: 'convert',
  convert: [],   // FileItem[]
  compress: [],
  archive: [],
  running: false,
  installingEngine: null,
  cancelFlags: new Set(),
  reqMap: new Map() // requestId -> item
};

let progUnsub = null;

/* ----------------------------------------------------------------- utils */

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const units = ['b', 'kb', 'mb', 'gb', 'tb'];
  const Ki = 1024;
  if (n < Ki) return `${n} ${I18N.t(`units.${units[0]}`)}`;
  let u = 1;
  let v = n / Ki;
  while (v >= Ki && u < units.length - 1) { v /= Ki; u++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${I18N.t(`units.${units[u]}`)}`;
}

function extOf(name) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function typeOf(name) {
  const e = extOf(name);
  if (['png', 'jpg', 'jpeg', 'webp', 'avif', 'tif', 'tiff', 'gif', 'svg', 'bmp', 'heic', 'heif', 'ico'].includes(e)) return 'image';
  if (['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a', 'wma', 'aiff', 'amr', 'ac3'].includes(e)) return 'audio';
  if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', 'ts', '3gp', 'ogv'].includes(e)) return 'video';
  if (e === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'txt', 'md', 'csv'].includes(e)) return 'doc';
  return 'other';
}

const TYPE_ICON = {
  image: '<svg viewBox="0 0 24 24" class="ic"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 3 3 3.5-3.5L20 17"/></svg>',
  audio: '<svg viewBox="0 0 24 24" class="ic"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  video: '<svg viewBox="0 0 24 24" class="ic"><rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="m16 10 5-3v10l-5-3"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" class="ic"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" class="ic"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  other: '<svg viewBox="0 0 24 24" class="ic"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/></svg>'
};

const DEFAULT_TARGET = {
  image: 'webp', audio: 'mp3', video: 'mp4', doc: 'pdf', pdf: null, other: null
};

function formatGroups() {
  return `
    <optgroup label="${esc(I18N.t('convert.fmtImages'))}">
      <option value="png">PNG</option><option value="jpg">JPG</option>
      <option value="webp">WebP</option><option value="avif">AVIF</option>
      <option value="tiff">TIFF</option><option value="gif">GIF</option>
      <option value="ico">ICO</option><option value="pdf">PDF</option>
    </optgroup>
    <optgroup label="${esc(I18N.t('convert.fmtAudio'))}">
      <option value="mp3">MP3</option><option value="wav">WAV</option>
      <option value="ogg">OGG</option><option value="opus">OPUS</option>
      <option value="flac">FLAC</option><option value="m4a">M4A</option>
      <option value="aac">AAC</option><option value="wma">WMA</option>
    </optgroup>
    <optgroup label="${esc(I18N.t('convert.fmtVideo'))}">
      <option value="mp4">MP4</option><option value="mkv">MKV</option>
      <option value="webm">WebM</option><option value="avi">AVI</option>
      <option value="mov">MOV</option><option value="gif">GIF</option>
    </optgroup>`;
}

function shortDir(p) {
  if (!p) return '…';
  const parts = String(p).split(/[\\/]/);
  return parts.length <= 2 ? p : '…/' + parts.slice(-2).join('/');
}

/* ---------------------------------------------------------------- toasts */

function toast(kind, msg, detail) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const icon = kind === 'ok'
    ? '<svg viewBox="0 0 24 24" class="ic tic"><path d="m5 13 4.5 4.5L19 8"/></svg>'
    : kind === 'err'
      ? '<svg viewBox="0 0 24 24" class="ic tic"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3v.1"/></svg>'
      : '<svg viewBox="0 0 24 24" class="ic tic"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.1"/></svg>';
  el.innerHTML = `${icon}<div><div>${esc(msg)}</div>${detail ? `<div class="terr">${esc(detail)}</div>` : ''}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 4200);
}

/* ------------------------------------------------------------- file model */

function makeItem(path, name, size) {
  return {
    id: uid(), path, name, size,
    type: typeOf(name),
    target: DEFAULT_TARGET[typeOf(name)] || null,
    status: 'idle', percent: 0,
    outPath: null, outSize: null, error: null, skipped: false
  };
}

async function addPaths(page, paths) {
  const infos = await api.fileInfo(paths);
  const list = state[page];
  let added = 0;
  for (const info of infos) {
    if (info.isDir) continue;
    if (list.some((f) => f.path === info.path)) continue;
    list.push(makeItem(info.path, info.name, info.size));
    added++;
  }
  renderList(page);
  updatePanels();
  return added;
}

/* --------------------------------------------------------------- rendering */

function renderList(page) {
  const container = $(`#${page}List`);
  if (!container) return;
  const items = state[page];
  if (page === 'archive') {
    container.innerHTML = items.map((f) => archiveRow(f)).join('');
  } else if (page === 'compress') {
    container.innerHTML = items.map((f) => compressRow(f)).join('');
  } else {
    container.innerHTML = items.map((f) => convertRow(f)).join('');
  }
  // wire per-row handlers
  $$('.fx.del', container).forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.id;
      state[page] = state[page].filter((f) => f.id !== id);
      renderList(page); updatePanels();
    };
  });
  if (page === 'convert') {
    $$('select.tsel', container).forEach((sel) => {
      sel.onchange = () => {
        const item = state.convert.find((f) => f.id === sel.dataset.id);
        if (item) item.target = sel.value;
      };
    });
  }
  $$('.openout', container).forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); api.showInFolder(b.dataset.out); };
  });
}

function rowShell(f, middle) {
  const stateText = f.status === 'running'
    ? `<div class="pstate"><span>${esc(I18N.t('common.processing', { p: f.percent }))}</span><span>${f.percent}%</span></div>`
    : f.status === 'done'
      ? `<div class="pstate"><span class="st-done">${esc(I18N.t('common.done'))}</span><span class="openout" data-out="${esc(f.outPath || '')}" style="cursor:pointer;text-decoration:underline">${esc(I18N.t('common.openFolder'))}</span></div>`
      : f.status === 'error'
        ? `<div class="pstate"><span class="st-error">${esc(I18N.t('common.failed'))}</span></div>`
        : f.status === 'skip'
          ? `<div class="pstate"><span class="st-skip">${esc(I18N.t('common.skipped'))}</span></div>`
          : `<div class="pstate"><span>${esc(I18N.t('common.waiting'))}</span></div>`;
  const bar = f.status === 'running' || f.status === 'done'
    ? `<div class="pbar"><i style="width:${f.percent}%"></i></div>` : '';
  return `
    <div class="frow ${middle.compressMode ? 'compress-mode' : ''}" data-id="${f.id}">
      <div class="fico">${TYPE_ICON[f.type] || TYPE_ICON.other}</div>
      <div><div class="fname" title="${esc(f.path)}">${esc(f.name)}</div><div class="fmeta">${fmtBytes(f.size)}</div></div>
      ${middle.html}
      <div class="fprog">${bar}${stateText}</div>
      <button class="fx del" data-id="${f.id}" title="${esc(I18N.t('common.remove'))}">
        <svg viewBox="0 0 24 24" class="ic"><path d="M5 7h14M10 7V5h4v2m-7 0 1 13h8l1-13"/></svg>
      </button>
    </div>`;
}

function convertRow(f) {
  const sel = `<div class="fselect"><select class="tsel" data-id="${f.id}">${formatGroups()}</select></div>`;
  const row = rowShell(f, { html: sel, compressMode: false });
  // mark selected option after join
  const tmp = document.createElement('div');
  tmp.innerHTML = row;
  const s = tmp.querySelector('select');
  if (s) {
    if (f.type === 'pdf' || f.type === 'other') {
      s.disabled = true;
      s.innerHTML = `<option>${esc(I18N.t('convert.pickFormat'))}</option>`;
    } else {
      const grp = s.querySelectorAll('optgroup');
      // keep only the group matching the file category
      const keep = f.type === 'doc' ? null : { image: 0, audio: 1, video: 2 }[f.type];
      if (keep === null || f.type === 'doc') {
        s.innerHTML = `<option value="pdf">PDF</option>`;
      } else {
        [...grp].forEach((g, i) => { if (i !== keep) g.remove(); });
      }
      if ([...s.options].some((o) => o.value === f.target)) s.value = f.target;
    }
  }
  return tmp.innerHTML;
}

function compressRow(f) {
  let mid;
  if (f.status === 'done') {
    const saved = f.inSize && f.outSize ? Math.max(0, Math.round((1 - f.outSize / f.inSize) * 100)) : 0;
    mid = `<div style="text-align:center">
        <div class="fmeta">${esc(I18N.t('compress.original'))} <b>${fmtBytes(f.inSize)}</b></div>
        <div class="fmeta">${esc(I18N.t('compress.compressed'))} <b class="saved_badge">${fmtBytes(f.outSize)}</b></div>
      </div>
      <div style="text-align:center"><span class="chip" style="color:var(--ok)">−${saved}%</span></div>`;
  } else if (f.status === 'skip') {
    mid = `<div style="text-align:center"><span class="chip" style="color:var(--warn)">${esc(I18N.t('compress.alreadyOptimal'))}</span></div><div></div>`;
  } else {
    const can = ['image', 'audio', 'video', 'pdf'].includes(f.type);
    mid = `<div class="fselect"><select disabled>${can
      ? `<option>${esc(f.type.toUpperCase())}</option>`
      : `<option>${esc(I18N.t('compress.cantCompress'))}</option>`}</select></div><div></div>`;
  }
  return rowShell(f, { html: mid, compressMode: true });
}

function archiveRow(f) {
  return rowShell(f, {
    html: `<div class="fmeta">${esc(f.type.toUpperCase())} • ${fmtBytes(f.size)}</div>`,
    compressMode: true
  }).replace('<div class="fprog">', '<div class="fprog" style="display:none">');
}

function updatePanels() {
  const has = (p) => state[p].length > 0;
  $('#convertPanel').classList.toggle('hidden', !has('convert'));
  $('#compressPanel').classList.toggle('hidden', !has('compress'));
  $('#archivePanel').classList.toggle('hidden', !has('archive'));
  // GitHub-parody counters next to the nav items
  const setC = (sel, n) => { const el = $(sel); if (el) el.textContent = n > 0 ? String(n) : ''; };
  setC('#cntConvert', state.convert.length);
  setC('#cntCompress', state.compress.length);
  setC('#cntArchive', state.archive.length);
  if (!state.running) {
    $('#btnConvert').disabled = !has('convert') || !state.convert.some((f) => f.type !== 'pdf' && f.type !== 'other');
    $('#btnCompress').disabled = !has('compress');
    $('#btnArchive').disabled = !has('archive');
  }
  const counts = { convert: state.convert.length, compress: state.compress.length, archive: state.archive.length };
  const active = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!state.running) setStatus(active ? I18N.t('common.filesCount', { n: active }) : I18N.t('common.ready'));
}

function setStatus(text) { $('#statusText').textContent = text; }

/* ----------------------------------------------------------------- queues */

const CONCURRENCY = { image: 4, audio: 2, video: 1, doc: 2 };

async function runQueue(page, taskFn) {
  state.running = true;
  updateCancelButtons();
  const items = state[page].filter((f) => f.status === 'idle' || f.status === 'error');
  const buckets = {};
  for (const it of items) (buckets[it.type] = buckets[it.type] || []).push(it);

  const runners = [];
  for (const [type, list] of Object.entries(buckets)) {
    let idx = 0;
    const n = Math.max(1, CONCURRENCY[type] || 1);
    for (let w = 0; w < n; w++) {
      runners.push((async () => {
        while (idx < list.length) {
          if (state.cancelFlags.has(page)) return;
          const item = list[idx++];
          item.status = 'running'; item.percent = 0;
          renderList(page);
          await taskFn(item);
          renderList(page);
        }
      })());
    }
  }
  await Promise.all(runners);

  state.running = false;
  state.cancelFlags.delete(page);
  updateCancelButtons();
  updatePanels();

  const okN = items.filter((f) => f.status === 'done').length;
  const skipN = items.filter((f) => f.status === 'skip').length;
  const errN = items.filter((f) => f.status === 'error').length;
  if (state.cancelFlags.has('__canceled' + page) || errN && !okN) { /* handled below */ }
  if (errN === 0 && okN > 0) {
    toast('ok', page === 'convert'
      ? I18N.t('toast.convertedN', { n: okN })
      : page === 'compress' ? I18N.t('toast.compressedN', { n: okN }) : I18N.t('toast.archiveDone'));
  }
  if (skipN > 0) toast('info', I18N.t('toast.skippedN', { n: skipN }));
  if (errN > 0) toast('err', I18N.t('toast.failedN', { n: errN }));
}

function updateCancelButtons() {
  [['#btnCancel1', 'convert'], ['#btnCancel2', 'compress'], ['#btnCancel3', 'archive']].forEach(([sel, page]) => {
    $(sel).classList.toggle('hidden', !state.running || state.page !== page);
  });
}

function progressHandler({ requestId, percent }) {
  const item = state.reqMap.get(requestId);
  if (item) { item.percent = percent; }
  const el = $(`.frow[data-id="${item ? item.id : ''}"] .pbar > i`);
  if (el && item) el.style.width = `${percent}%`;
}

async function runOne(item, kind, extra) {
  const requestId = uid();
  state.reqMap.set(requestId, item);
  try {
    const payload = Object.assign({
      requestId, src: item.path, outDir: state.outDir,
      policy: state.settings.overwritePolicy || 'keepBoth'
    }, extra || {});
    const res = kind === 'convert' ? await api.convertFile(payload) : await api.compressFile(payload);
    if (res.ok) {
      item.status = res.skipped ? 'skip' : 'done';
      item.percent = 100;
      item.outPath = res.outPath;
      item.outSize = res.outSize;
      item.inSize = res.inSize || item.size;
      if (item.status === 'done') recordActivity();
    } else {
      item.status = 'error'; item.error = res.error;
      toast('err', item.name, res.error);
    }
  } catch (e) {
    item.status = 'error'; item.error = String(e && e.message || e);
  } finally {
    state.reqMap.delete(requestId);
  }
}

/* ------------------------------------------------------------------ pages */

function switchPage(page) {
  state.page = page;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
  updateCancelButtons();
  if (page === 'settings') renderActivity();
}

/* ------------------------------------------------ repo bar (GitHub parody) */

function applyStar() {
  const starred = !!state.settings.starred;
  $('#starCount').textContent = 128 + (starred ? 1 : 0);
  $('#starLabel').textContent = starred ? 'Starred' : 'Star';
  $('#btnStar').style.color = starred ? 'var(--warn)' : '';
}

function initRepoBar() {
  $('#repoVersion').textContent = `v${state.appInfo.version}`;
  applyStar();
  $('#btnStar').onclick = () => {
    state.settings.starred = !state.settings.starred;
    saveSettings({ starred: state.settings.starred });
    applyStar();
    toast('info', state.settings.starred ? '★ Starred — спасибо! (это пародия, звёздочки декоративные)' : 'Unstarred');
  };
  $('#btnFork').onclick = () => {
    const forks = $('#btnFork .counter');
    forks.textContent = String(Number(forks.textContent || 7) + 1);
    toast('ok', '⑂ «Форк» создан… шутка 😄 Это allfilesZ, а не GitHub.');
  };
}

/* --------------------------------------- conversion activity (parody graph) */

function recordActivity(n = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const a = Object.assign({}, state.settings.activity || {});
  a[today] = (a[today] || 0) + n;
  const keys = Object.keys(a).sort();
  while (keys.length > 130) delete a[keys.shift()];
  state.settings.activity = a;
  saveSettings({ activity: a });
}

function renderActivity() {
  const el = $('#activityGraph');
  if (!el) return;
  const a = state.settings.activity || {};
  const weeks = 18;
  const today = new Date();
  const cells = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const n = a[key] || 0;
    const lvl = n === 0 ? '' : n <= 2 ? 'l1' : n <= 5 ? 'l2' : n <= 10 ? 'l3' : 'l4';
    cells.push(`<span class="cell ${lvl}" title="${key}: ${n}"></span>`);
  }
  el.innerHTML = cells.join('');
}

/* ------------------------------------------------------------ page: start */

function startConvert() {
  if (state.running) return;
  const s = state.settings;
  runQueue('convert', (item) => runOne(item, 'convert', {
    target: item.target,
    opts: { imageQuality: s.imageQuality ?? 82, videoCrf: s.videoCrf ?? 23, videoPreset: s.videoPreset || 'medium', audioBitrate: s.audioBitrate ?? 192, keepMeta: true }
  }));
}

function startCompress() {
  if (state.running) return;
  const s = state.settings;
  const preset = $('#presetSeg .active') ? $('#presetSeg .active').dataset.preset : 'balanced';
  const opts = preset === 'custom' ? {
    imageQuality: Number($('#slImgQ').value),
    videoCrf: Number($('#slCrf').value),
    audioBitrate: Number($('#slBr').value),
    videoPreset: 'medium'
  } : undefined;
  runQueue('compress', (item) => runOne(item, 'compress', { preset, opts }));
}

async function startArchive() {
  if (state.running || !state.archive.length) return;
  state.running = true; updateCancelButtons();
  const btn = $('#btnArchive'); btn.disabled = true;
  const requestId = uid();
  try {
    const res = await api.archiveCreate({
      requestId,
      files: state.archive.map((f) => f.path),
      outDir: state.outDir,
      name: ($('#archName').value || 'archive').replace(/[\\/:*?"<>|]/g, '_'),
      format: $('#archFormat').value,
      level: Number($('#archLevel').value)
    });
    if (res.ok) { toast('ok', I18N.t('toast.archiveDone'), res.outPath); recordActivity(); }
    else toast('err', I18N.t('common.failed'), res.error);
  } catch (e) {
    toast('err', I18N.t('common.failed'), String(e && e.message || e));
  } finally {
    state.running = false; btn.disabled = false; updateCancelButtons();
  }
}

/* --------------------------------------------------------------- settings */

function applyTheme(theme, persist) {
  const resolved = theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  document.body.dataset.theme = resolved;
  $('#themeIcon').innerHTML = resolved === 'light'
    ? '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M4.9 4.9 6.7 6.7M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>'
    : '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/>';
  $$('#themeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
  if (persist) saveSettings({ theme });
}

function applyAccent(accent, persist) {
  document.body.dataset.accent = accent;
  $$('#accentSwatches .swatch').forEach((b) => b.classList.toggle('active', b.dataset.accent === accent));
  if (persist) saveSettings({ accent });
}

/** Character (anime) theme: overrides accent + background tints. */
function applyCharacter(character, persist) {
  if (character) {
    document.body.dataset.character = character;
  } else {
    delete document.body.dataset.character;
  }
  $$('#charThemes .char-card').forEach((b) => b.classList.toggle('active', b.dataset.character === character));
  if (persist) saveSettings({ character: character || null });
}

/** Apply a user background (photo/GIF) from a data URL. */
function applyBackground(dataUrl) {
  const el = $('#userbg');
  if (dataUrl) {
    el.style.backgroundImage = `url("${dataUrl}")`;
    el.classList.add('on');
    $('#btnBgClear').classList.remove('hidden');
  } else {
    el.style.backgroundImage = '';
    el.classList.remove('on');
    $('#btnBgClear').classList.add('hidden');
  }
}

function saveSettings(patch) {
  Object.assign(state.settings, patch);
  api.settingsSet(patch);
}

function renderEngines() {
  const t = state.tools || {};
  const engines = [
    { key: 'ffmpeg', label: I18N.t('engine.ffmpeg'), found: t.ffmpeg && t.ffmpeg.found, hint: I18N.t('engine.bundled') },
    { key: 'libreoffice', label: I18N.t('engine.libreoffice'), found: t.libreoffice && t.libreoffice.found, hint: t.libreoffice && t.libreoffice.found ? I18N.t('engine.found') : I18N.t('engine.libreofficeHint') },
    { key: 'ghostscript', label: I18N.t('engine.ghostscript'), found: t.ghostscript && t.ghostscript.found, hint: t.ghostscript && t.ghostscript.found ? I18N.t('engine.found') : I18N.t('engine.ghostscriptHint') }
  ];
  const canInstall = (key) =>
    key !== 'ffmpeg' && state.appInfo.platform === 'win32' &&
    engines.find((e) => e.key === key) && !engines.find((e) => e.key === key).found &&
    state.appInfo.isElectron !== false;
  $('#engineList').innerHTML = engines.map((e) => `
    <div class="engine">
      <span class="dot ${e.found ? 'on' : 'off'}"></span>
      <span>${esc(e.label)}</span>
      ${canInstall(e.key)
        ? `<button class="btn ghost sm engine-install" data-engine="${e.key}" ${state.installingEngine ? 'disabled' : ''}>
             ${state.installingEngine === e.key ? esc(I18N.t('settings.installing')) : esc(I18N.t('settings.install'))}
           </button>`
        : ''}
      <span class="hint">${esc(e.hint)}</span>
    </div>`).join('');
  $$('#engineList .engine-install').forEach((b) => {
    b.onclick = () => installEngine(b.dataset.engine);
  });
  $('#statusChips').innerHTML = engines.map((e) =>
    `<span class="chip"><span class="dot ${e.found ? 'on' : 'off'}"></span>${esc(e.label)}</span>`).join('');
}

async function installEngine(key) {
  if (state.installingEngine) return;
  state.installingEngine = key;
  renderEngines();
  toast('info', I18N.t('settings.installing'));
  try {
    const res = await api.installEngine(key);
    if (res.tools) state.tools = res.tools;
    const label = I18N.t(`engine.${key}`);
    if (res.ok) toast('ok', I18N.t('toast.engineInstalled', { name: label }));
    else toast('err', I18N.t('toast.engineInstallFailed', { name: label }), res.error);
  } catch (e) {
    toast('err', I18N.t('toast.engineInstallFailed', { name: I18N.t(`engine.${key}`) }), String(e && e.message || e));
  } finally {
    state.installingEngine = null;
    if (!state.tools || !state.tools.ghostscript) { try { state.tools = await api.detectTools(); } catch (_) {} }
    renderEngines();
  }
}

/* --------------------------------------------------------------- language */

function openLangMenu() {
  const menu = $('#langMenu');
  menu.classList.remove('hidden');
  renderLangList('');
  $('#langSearch').value = '';
  setTimeout(() => $('#langSearch').focus(), 40);
}

function closeLangMenu() { $('#langMenu').classList.add('hidden'); }

function renderLangList(filter) {
  const cur = I18N.cur();
  const list = I18N.codes()
    .map((c) => ({ c, meta: (I18N.pack(c) || {}).meta || {} }))
    .filter((x) => {
      if (!filter) return true;
      const f = filter.toLowerCase();
      return x.c.toLowerCase().includes(f) || String(x.meta.name || '').toLowerCase().includes(f);
    });
  $('#langList').innerHTML = list.map((x) => `
    <button class="lang-item ${x.c === cur ? 'active' : ''}" data-code="${x.c}">
      <span>${esc(x.meta.name || x.c)}</span>
      ${x.c === cur
        ? '<svg viewBox="0 0 24 24" class="ic tick"><path d="m5 13 4.5 4.5L19 8"/></svg>'
        : `<span class="code">${esc(x.c)}</span>`}
    </button>`).join('');
  $$('#langList .lang-item').forEach((b) => {
    b.onclick = () => {
      I18N.set(b.dataset.code);
      saveSettings({ lang: b.dataset.code });
      refreshTexts();
      closeLangMenu();
    };
  });
}

function refreshTexts() {
  I18N.apply();
  $('#langCode').textContent = I18N.cur().toUpperCase().slice(0, 2);
  renderEngines();
  renderList('convert'); renderList('compress'); renderList('archive');
  updatePanels();
  const label = shortDir(state.outDir);
  $('#outDirLabel').textContent = label;
  $('#outDirLabel2').textContent = label;
  $('#outDirLabel3').textContent = state.outDir || '…';
}

/* ------------------------------------------------------------- drag&drop */

function wireDropzone(el, page) {
  el.addEventListener('click', async () => {
    const paths = await api.pickFiles();
    if (paths && paths.length) await addPaths(page, paths);
  });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragover'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('dragover');
    const files = [...(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : [])];
    const paths = files.map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) await addPaths(page, paths);
  });
}

/* ------------------------------------------------------------------ init */

async function init() {
  // --- data
  state.appInfo = await api.info();
  await I18N.load(api);
  state.settings = await api.settingsGet();
  state.tools = await api.detectTools();

  // --- language (saved → system)
  const lang = state.settings.lang || I18N.bestFor(state.appInfo.locale || navigator.language);
  I18N.set(lang, { silent: true });
  I18N.onChange(() => {});
  document.getElementById('tbTitle').textContent = I18N.t('app.name');

  // --- theme & accent & character
  applyTheme(state.settings.theme || 'auto');
  applyAccent(state.settings.accent || 'blue');
  applyCharacter(state.settings.character || null);
  applyBackground(await api.bgGet());
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if ((state.settings.theme || 'auto') === 'auto') applyTheme('auto');
  });

  // --- output dir
  state.outDir = state.settings.outDir || state.appInfo.outDirDefault;

  // --- version chips + repo bar parody
  $('#chipVersion').textContent = `v${state.appInfo.version}`;
  $('#chipVersion2').textContent = `v${state.appInfo.version}`;
  initRepoBar();

  // --- window controls
  $('#btnClose').onclick = () => api.winControl('close');
  $('#btnMin').onclick = () => api.winControl('min');
  $('#btnMax').onclick = () => api.winControl('max');

  // --- navigation
  $$('#navGroup .nav-item').forEach((b) => { b.onclick = () => switchPage(b.dataset.page); });

  // --- dropzones
  wireDropzone($('#dzConvert'), 'convert');
  wireDropzone($('#dzCompress'), 'compress');
  wireDropzone($('#dzArchive'), 'archive');
  $('#btnBrowse1').onclick = (e) => { e.preventDefault(); e.stopPropagation(); $('#dzConvert').click(); };
  $('#btnBrowse2').onclick = (e) => { e.preventDefault(); e.stopPropagation(); $('#dzCompress').click(); };
  $('#btnBrowse3').onclick = (e) => { e.preventDefault(); e.stopPropagation(); $('#dzArchive').click(); };

  // --- buttons: clear
  $('#btnClear1').onclick = () => { state.convert = []; renderList('convert'); updatePanels(); };
  $('#btnClear2').onclick = () => { state.compress = []; renderList('compress'); updatePanels(); };
  $('#btnClear3').onclick = () => { state.archive = []; renderList('archive'); updatePanels(); };

  // --- output dir pickers
  const pickDir = async () => {
    const d = await api.pickDir();
    if (d) { state.outDir = d; saveSettings({ outDir: d }); refreshTexts(); }
  };
  $('#btnOutDir').onclick = pickDir;
  $('#btnOutDir2').onclick = pickDir;
  $('#btnOutDir3').onclick = pickDir;

  // --- convert / compress / archive actions
  $('#btnConvert').onclick = startConvert;
  $('#btnCompress').onclick = startCompress;
  $('#btnArchive').onclick = startArchive;

  // --- cancel
  const cancel = (page) => {
    state.cancelFlags.add(page);
    state.reqMap.forEach((_v, k) => api.cancelJob(k));
    toast('info', I18N.t('toast.canceled'));
  };
  $('#btnCancel1').onclick = () => cancel('convert');
  $('#btnCancel2').onclick = () => cancel('compress');
  $('#btnCancel3').onclick = () => cancel('archive');

  // --- presets
  $$('#presetSeg button').forEach((b) => {
    b.onclick = () => {
      $$('#presetSeg button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      $('#customSliders').classList.toggle('hidden', b.dataset.preset !== 'custom');
    };
  });

  // --- custom sliders
  const bindSlider = (sel, out, fmt) => {
    const el = $(sel);
    el.oninput = () => { $(out).textContent = fmt(el.value); };
  };
  bindSlider('#slImgQ', '#slImgQv', (v) => v);
  bindSlider('#slCrf', '#slCrfv', (v) => v);
  bindSlider('#slBr', '#slBrv', (v) => `${v}k`);

  // --- theme quick toggle & segmented
  $('#btnTheme').onclick = () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    state.settings.theme = next;
    $$('#themeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.theme === next));
  };
  $$('#themeSeg button').forEach((b) => {
    b.onclick = () => { applyTheme(b.dataset.theme, true); state.settings.theme = b.dataset.theme; };
  });

  // --- accent
  $$('#accentSwatches .swatch').forEach((b) => {
    b.onclick = () => {
      applyCharacter(null, false);
      applyAccent(b.dataset.accent, true);
    };
  });

  // --- character (anime) themes
  $$('#charThemes .char-card').forEach((b) => {
    b.onclick = () => {
      const next = document.body.dataset.character === b.dataset.character ? null : b.dataset.character;
      applyCharacter(next, true);
      if (next) applyAccent(document.body.dataset.accent || 'blue', false); // keep swatch states fresh
    };
  });

  // --- user background (photo/GIF)
  $('#btnBgSet').onclick = async () => {
    const res = await api.bgChoose();
    if (!res || res.ok === false) {
      if (res && res.error) toast('err', I18N.t('toast.bgSet'), res.error);
      return;
    }
    applyBackground(res.dataUrl);
    toast('ok', I18N.t('toast.bgSet'));
  };
  $('#btnBgClear').onclick = async () => {
    await api.bgClear();
    applyBackground(null);
    toast('info', I18N.t('toast.bgRemoved'));
  };

  // --- language menus
  $('#btnLang').onclick = (e) => { e.stopPropagation(); $('#langMenu').classList.contains('hidden') ? openLangMenu() : closeLangMenu(); };
  $('#btnLangBig').onclick = (e) => { e.stopPropagation(); openLangMenu(); };
  $('#langSearch').oninput = (e) => renderLangList(e.target.value);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#langMenu') && !e.target.closest('#btnLang') && !e.target.closest('#btnLangBig')) closeLangMenu();
  });

  // --- policy
  $$('#policySeg button').forEach((b) => {
    b.onclick = () => {
      $$('#policySeg button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      saveSettings({ overwritePolicy: b.dataset.policy });
    };
    if ((state.settings.overwritePolicy || 'keepBoth') === b.dataset.policy) b.classList.add('active');
    else b.classList.remove('active');
  });

  // --- PDF tools
  $('#btnPdfMerge').onclick = async () => {
    const pdfs = state.archive.filter((f) => f.type === 'pdf').map((f) => f.path);
    if (pdfs.length < 2) return toast('info', I18N.t('archive.needPdfFiles'));
    const res = await api.pdfMerge({ requestId: uid(), files: pdfs, outDir: state.outDir });
    if (res.ok) { toast('ok', I18N.t('toast.pdfMerged'), res.outPath); recordActivity(); }
    else toast('err', I18N.t('common.failed'), res.error);
  };
  $('#btnPdfImg').onclick = async () => {
    const imgs = state.archive.filter((f) => f.type === 'image').map((f) => f.path);
    if (!imgs.length) return toast('info', I18N.t('archive.needPdfImages'));
    const res = await api.pdfFromImages({ requestId: uid(), files: imgs, outDir: state.outDir });
    if (res.ok) { toast('ok', I18N.t('toast.pdfFromImages'), res.outPath); recordActivity(); }
    else toast('err', I18N.t('common.failed'), res.error);
  };

  // --- progress events
  progUnsub = api.onProgress(progressHandler);

  // --- global drag&drop onto whole window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // --- keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $(`#dz${state.page[0].toUpperCase()}${state.page.slice(1)}`).click(); }
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      if (state.page === 'convert') startConvert();
      else if (state.page === 'compress') startCompress();
      else if (state.page === 'archive') startArchive();
    }
    if (mod && e.key === ',') { e.preventDefault(); switchPage('settings'); }
    if (e.key === 'Escape') {
      if (!$('#langMenu').classList.contains('hidden')) { closeLangMenu(); return; }
      if (state.running) cancel(state.page);
    }
  });

  // --- demo seed (browser screenshots)
  window.addEventListener('demo-add', async (e) => {
    for (const f of e.detail) {
      const item = makeItem(`/home/user/${f.name}`, f.name, f.size);
      state.convert.push(item);
    }
    renderList('convert');
    updatePanels();
  });

  // --- smoke test reply
  api.onSmokeCheck(() => api.smokeOk());

  refreshTexts();
  switchPage('convert');
}

document.addEventListener('DOMContentLoaded', init);
