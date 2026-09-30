const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function runtime(seed = 7) {
  let randomSeed = seed;
  const random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const noop = () => {};
  const context2D = new Proxy({}, { get(obj, prop) { if (prop in obj) return obj[prop]; if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: noop }); return noop; }, set(obj, prop, value) { obj[prop] = value; return true; } });
  class Element {
    constructor(id = '') {
      this.id = id; this.style = { setProperty(key, value) { this[key] = value; } }; this.attributes = {}; this.children = []; this.listeners = {}; this.textContent = ''; this.disabled = false; this.width = 600; this.height = 1066;
      const classes = new Set(); this.classes = classes;
      this.classList = { add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle: (x, on = !classes.has(x)) => { on ? classes.add(x) : classes.delete(x); return on; } };
      this.selectors = new Map();
    }
    set className(v) { this.classes.clear(); v.split(/\s+/).forEach(x => this.classes.add(x)); }
    get className() { return [...this.classes].join(' '); }
    set innerHTML(v) { this._html = v; this.children = []; this.selectors.clear(); }
    get innerHTML() { return this._html || ''; }
    append(...v) { this.children.push(...v); }
    appendChild(v) { this.append(v); }
    replaceChildren(...v) { this.children = v; }
    querySelector(v) { if (!this.selectors.has(v)) this.selectors.set(v, new Element()); return this.selectors.get(v); }
    getContext() { return context2D; }
    setAttribute(k, v) { this.attributes[k] = v; }
    addEventListener(k, fn) { this.listeners[k] = fn; }
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 600, height: 1066 }; }
    scrollTo() {}
    setPointerCapture() {}
    play() { return Promise.resolve(); }
    pause() {}
  }
  const elements = new Map();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) { const el = new Element(match[1]); const cls = match[0].match(/class="([^"]+)"/); if (cls) el.className = cls[1]; elements.set(el.id, el); }
  const storage = new Map([['voidstorm_settings', JSON.stringify({ music: false, sfx: false, shake: false })]]);
  const listeners = {};
  const math = Object.create(Math); math.random = random;
  const sandbox = {
    console, performance, Date, Math: math, URLSearchParams, Set, Map, Promise,
    setTimeout: () => 1, clearTimeout: noop, requestAnimationFrame: noop, matchMedia: () => ({ matches: false }),
    location: { search: '' }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    Image: class { constructor() { this.width = this.height = 1254; } set src(value) { this._src = value; this.onload?.(); } },
    document: { hidden: false, head: new Element(), createElement: () => new Element(), getElementById: id => { if (!elements.has(id)) throw new Error('Missing HTML id: ' + id); return elements.get(id); }, querySelectorAll: selector => selector === '.screen' ? [...elements.values()].filter(el => el.classes.has('screen')) : [], addEventListener: (k, fn) => { listeners[k] = fn; } },
    addEventListener: (k, fn) => { listeners[k] = fn; }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const name of ['atlas-frames.js', 'balance.js', 'vk.js', 'game.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', name), 'utf8'), context, { filename: name });
  return { context, elements, storage, listeners, run: code => vm.runInContext(code, context) };
}
module.exports = { runtime };
