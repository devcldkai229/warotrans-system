const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

module.exports = function createLoader(overrides = {}, globals = {}) {
  const cache = new Map();
  function load(name) {
    const file = path.resolve(root, name);
    const key = path.relative(root, file).replaceAll('\\', '/');
    if (Object.hasOwn(overrides, key)) return overrides[key];
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    const localRequire = dependency => {
      if (Object.hasOwn(overrides, dependency)) return overrides[dependency];
      if (dependency.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), dependency);
        return load(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '.tsx');
      }
      return require(dependency);
    };
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
      console, URL, URLSearchParams, Headers, Response, Request, setTimeout, clearTimeout,
      setInterval, clearInterval, __DEV__: false, process: { env: {} }, ...globals,
    }, { filename: file })(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
};
