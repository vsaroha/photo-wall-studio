const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); },
    toggle(name, force) {
      if (typeof force === 'boolean') {
        if (force) classes.add(name);
        else classes.delete(name);
        return force;
      }
      if (classes.has(name)) {
        classes.delete(name);
        return false;
      }
      classes.add(name);
      return true;
    },
    toArray() { return Array.from(classes); }
  };
}

function createElement(initial = {}) {
  return {
    value: '',
    checked: false,
    hidden: false,
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    className: '',
    classList: createClassList(),
    children: [],
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    querySelector() {
      return createElement();
    },
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1200, height: 900 };
    },
    focus() {},
    ...initial
  };
}

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

function createAppContext(options = {}) {
  const calls = {
    renderCanvas: 0,
    renderPhotoList: 0,
    saveState: 0,
    setLayoutFeedback: 0,
    showToast: []
  };

  const elementDefaults = {
    prefRows: { value: '2' },
    prefCols: { value: '3' },
    spacing: { value: '2' },
    layoutStyle: { value: 'manual' },
    artDirection: { value: 'balanced' },
    gridSize: { value: '1' },
    snapToGrid: { checked: false },
    showGrid: { checked: false },
    photoW: { value: '4' },
    photoH: { value: '6' },
    photoQty: { value: '1' },
    exportName: { value: 'photo-wall-studio-layout' },
    exportFormat: { value: 'auto' },
    exportOrientation: { value: 'auto' },
    exportLabels: { checked: true },
    exportLegend: { checked: true },
    canvasWrapper: { style: {} },
    emptyState: { style: {} },
    layoutFeedback: {},
    onboardingOverlay: { dataset: {}, hidden: true },
    onboardingClose: {},
    photoList: {},
    dimTop: {},
    dimLeft: {},
    toast: {}
  };

  const elements = {};
  Object.keys(elementDefaults).forEach((id) => {
    elements[id] = createElement(elementDefaults[id]);
  });

  const unitButtons = [
    createElement({ dataset: { unit: 'in' }, classList: createClassList(['active']) }),
    createElement({ dataset: { unit: 'cm' }, classList: createClassList() })
  ];
  const unitLabels = [createElement({ textContent: 'in' }), createElement({ textContent: 'in' })];

  const documentStub = {
    getElementById(id) {
      if (!elements[id]) elements[id] = createElement();
      return elements[id];
    },
    querySelectorAll(selector) {
      if (selector === '.unit-toggle button') return unitButtons;
      if (selector === '.unit-label') return unitLabels;
      return [];
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    createElement() {
      return createElement();
    }
  };

  const context = vm.createContext({
    console,
    Math,
    Number,
    String,
    Boolean,
    JSON,
    Array,
    Object,
    Date,
    parseFloat,
    parseInt,
    setTimeout,
    clearTimeout,
    document: documentStub,
    localStorage: createStorage(),
    currentCanvas: { w: 10, h: 10 },
    renderCanvas() {
      calls.renderCanvas += 1;
    },
    renderPhotoList() {
      calls.renderPhotoList += 1;
    },
    saveState() {
      calls.saveState += 1;
    },
    setLayoutFeedback() {
      calls.setLayoutFeedback += 1;
    },
    showToast(msg) {
      calls.showToast.push(msg);
    },
    getScale() {
      return 1;
    },
    checkOverlaps() {},
    selectPhoto() {},
    setSelectedIds(ids) {
      context.selectedIds = Array.isArray(ids) ? [...ids] : [];
      context.selectedId = context.selectedIds.length > 0
        ? context.selectedIds[context.selectedIds.length - 1]
        : null;
    }
  });

  context.window = context;

  function loadScripts(scriptPaths = ['state.js', 'layout.js', 'interact.js']) {
    for (const rel of scriptPaths) {
      const filePath = path.join(options.rootDir || process.cwd(), rel);
      const source = fs.readFileSync(filePath, 'utf8');
      vm.runInContext(source, context, { filename: rel });
    }
  }

  function run(code) {
    return vm.runInContext(code, context);
  }

  function json(expr) {
    const serialized = vm.runInContext(`JSON.stringify(${expr})`, context);
    return JSON.parse(serialized);
  }

  loadScripts(options.scriptPaths);

  return { context, calls, elements, run, json, loadScripts };
}

module.exports = {
  createAppContext
};
