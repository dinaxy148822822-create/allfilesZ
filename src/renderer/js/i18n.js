'use strict';

/**
 * Tiny i18n runtime. Language packs live in src/renderer/i18n/*.json and are
 * provided by the Electron bridge (or fetched over http in browser demo mode).
 */
window.I18N = (() => {
  const packs = {};          // code -> pack
  let current = 'en';
  let onChangeCb = null;

  function t(key, vars) {
    let node = packs[current];
    if (!node) return key;
    for (const part of key.split('.')) {
      node = node ? node[part] : undefined;
      if (node === undefined) break;
    }
    if (node === undefined && current !== 'en') {
      // fallback chain: current → en → raw key
      node = packs['en'];
      for (const part of key.split('.')) {
        node = node ? node[part] : undefined;
        if (node === undefined) break;
      }
    }
    if (typeof node !== 'string') return key;
    if (vars) {
      return node.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
    }
    return node;
  }

  function dir(code) {
    const p = packs[code];
    return (p && p.meta && p.meta.dir) || 'ltr';
  }

  function set(code, { silent } = {}) {
    if (!packs[code]) code = 'en';
    current = code;
    document.documentElement.lang = code;
    document.body.dir = dir(code);
    apply();
    if (!silent && onChangeCb) onChangeCb(code);
  }

  /** Translate all [data-i18n] / [data-i18n-title] / [data-i18n-placeholder] nodes. */
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  function codes() { return Object.keys(packs).sort(); }
  function pack(code) { return packs[code]; }
  function cur() { return current; }
  function onChange(cb) { onChangeCb = cb; }

  /** Pick best pack for a BCP47 locale like "pt-BR". */
  function bestFor(locale) {
    if (!locale) return 'en';
    const norm = String(locale).replace('_', '-').toLowerCase();
    if (packs[norm]) return norm;
    const base = norm.split('-')[0];
    // zh-TW → zh-TW pack; zh → zh-CN; pt-* → pt
    if (base === 'zh') return packs[norm] ? norm : (norm.includes('hk') || norm.includes('tw') || norm.includes('hant') ? 'zh-TW' : 'zh-CN');
    if (packs[base]) return base;
    return 'en';
  }

  async function load(api) {
    const data = await api.i18nList();
    Object.assign(packs, data);
  }

  return { load, t, set, apply, codes, pack, cur, dir, bestFor, onChange, packs };
})();
