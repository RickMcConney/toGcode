import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

const workerScripts = {
  ProfileWorker: [
    'js/lib/clipperf.js',
    'js/util.js',
    'js/toolPath.js',
    'js/workers/ProfileWorker.js'
  ],
  SurfacingWorker: [
    'js/util.js',
    'js/workers/SurfacingWorker.js'
  ],
  InlayWorker: [
    'js/lib/clipperf.js',
    'js/util.js',
    'js/toolPath.js',
    'js/workers/pocketWorker.js',
    'js/workers/InlayWorker.js'
  ],
  PocketWorker: [
    'js/lib/clipperf.js',
    'js/util.js',
    'js/toolPath.js',
    'js/workers/pocketWorker.js'
  ],
  DrillWorker: [
    'js/workers/drillWorker.js'
  ],
  Profile3DWorker: [
    'js/lib/clipperf.js',
    'js/workers/3dProfileWorker.js'
  ],
  GcodePreprocessorWorker: [
    'js/gcodeParser.js',
    'js/workers/gcodePreprocessorWorker.js'
  ]
};

const workerAliases = {
  three: path.join(__dirname, 'js/lib/three.module.js'),
  'three/addons/loaders/STLLoader': path.join(__dirname, 'js/lib/STLLoader.js')
};

const vendorScripts = [
  'js/lib/jquery-2.1.1.min.js',
  'js/lib/paper-full.js',
  'js/lib/lucide.js',
  'js/lib/bootstrap-min.js',
  'js/gcodeView.js',
  'js/bootstrap-layout/simulationControls.js',
  'js/bootstrap-layout/gcodeProfiles.js',
  'js/bootstrap-layout/modals.js',
  'js/bootstrap-layout.js',
  'js/lib/simplify.js',
  'js/lib/clipperf.js',
  'js/lib/jspoly.js',
  'js/lib/bezier.js',
  'js/lib/maker.js',
  'js/PropertiesManager.js',
  'js/operations/Operation.js',
  'js/operations/Select.js',
  'js/operations/Workpiece.js',
  'js/operations/Transform.js',
  'js/operations/Curve.js',
  'js/operations/Pen.js',
  'js/operations/Line.js',
  'js/operations/Shape.js',
  'js/fontList.js',
  'js/operations/Text.js',
  'js/operations/Drill.js',
  'js/operations/TabEditor.js',
  'js/operations/Measure.js',
  'js/operations/OperationManager.js',
  'js/StepWiseHelpSystem.js',
  'js/ToolPathProperties.js',
  'js/util.js',
  'js/gcodeParser.js',
  'js/2dView.js',
  'js/gcode.js',
  'js/toolPath.js',
  'js/CncController.js',
  'js/cnc.js',
  'js/2dSimulation.js',
  'js/lib/path-data-polyfill.js',
  'js/svg.js',
  'js/dxf.js',
  'js/lib/opentype.js'
];

const embeddedFontFiles = [
  'fonts/Roboto-Regular.ttf',
  'fonts/Jointly3.otf',
  'fonts/NationalPark-ExtraLight.otf',
  'fonts/NationalPark-Light.otf',
  'fonts/NationalPark-Regular.otf',
  'fonts/NationalPark-Medium.otf',
  'fonts/NationalPark-SemiBold.otf',
  'fonts/NationalPark-Bold.otf',
  'fonts/NationalPark-ExtraBold.otf'
];

const indexHtml = await readFile(path.join(__dirname, 'index.html'), 'utf8');
const inlineLucideScript = extractInlineScript(indexHtml, '// Register custom inlay icons with Lucide');
const inlineStyles = extractInlineStyle(indexHtml);
const bodyMarkup = extractBodyMarkup(indexHtml);
const bundledCss = await buildCss(inlineStyles);

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const workerSources = await buildWorkerSources(workerScripts);
const embeddedFonts = await buildEmbeddedFonts(embeddedFontFiles);

const moduleEntryPath = path.join(__dirname, '.build-modules-entry.js');
const moduleEntrySource = createModuleEntrySource(inlineLucideScript, workerSources, embeddedFonts);
await writeFile(moduleEntryPath, moduleEntrySource);

try {
  const appBuild = await build({
    entryPoints: [moduleEntryPath],
    outdir: distDir,
    bundle: true,
    format: 'iife',
    globalName: 'FreazyKamBundle',
    minify: true,
    sourcemap: false,
    target: ['es2020'],
    entryNames: 'app',
    write: false,
    plugins: [aliasPlugin(workerAliases)]
  });

  const appBundle = appBuild.outputFiles.find((file) => file.path.endsWith('.js') || file.path === '<stdout>');
  if (!appBundle) {
    throw new Error('Application bundle was not produced');
  }

  const vendorBundle = await concatenateScripts(vendorScripts, inlineLucideScript);
  const finalBundle = await minifyJavaScript(`${vendorBundle}\n\n${appBundle.text}`);
  await writeFile(path.join(distDir, 'bundle.js'), finalBundle);
} finally {
  await rm(moduleEntryPath, { force: true });
}
await writeFile(path.join(distDir, 'app.css'), bundledCss);
await writeFile(path.join(distDir, 'index.html'), createDistHtml(bodyMarkup));
await copyFile(path.join(__dirname, 'favicon.ico'), path.join(distDir, 'favicon.ico'));
await copyDirectory(path.join(__dirname, 'icons'), path.join(distDir, 'icons'));

function aliasPlugin(entries) {
  return {
    name: 'alias-paths',
    setup(buildApi) {
      for (const [key, resolvedPath] of Object.entries(entries)) {
        buildApi.onResolve({ filter: new RegExp('^' + escapeRegExp(key) + '$') }, () => ({
          path: resolvedPath
        }));
      }
    }
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractInlineScript(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Inline script marker not found: ${marker}`);
  }

  const scriptStart = html.lastIndexOf('<script', markerIndex);
  const contentStart = html.indexOf('>', scriptStart) + 1;
  const contentEnd = html.indexOf('</script>', markerIndex);
  return html.slice(contentStart, contentEnd).trim();
}

function extractInlineStyle(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/i);
  return match ? match[1].trim() : '';
}

function extractBodyMarkup(html) {
  const match = html.match(/<body>([\s\S]*?)<\/body>/i);
  if (!match) {
    throw new Error('Body markup not found in index.html');
  }

  return match[1].trim();
}

async function buildCss(inlineStyleBlock) {
  const cssEntryPath = path.join(__dirname, '.build-style-entry.css');
  const cssEntry = `@import './css/bootstrap-min.css';\n@import './css/app.css';\n${inlineStyleBlock}\n`;
  await writeFile(cssEntryPath, cssEntry);

  try {
    const result = await build({
      entryPoints: [cssEntryPath],
      bundle: true,
      minify: true,
      sourcemap: false,
      write: false,
      loader: {
        '.ttf': 'dataurl',
        '.otf': 'dataurl'
      }
    });

    const cssFile = result.outputFiles.find((file) => file.path.endsWith('.css') || file.path === '<stdout>');
    if (!cssFile) {
      throw new Error('CSS bundle was not produced');
    }
    return cssFile.text;
  } finally {
    await rm(cssEntryPath, { force: true });
  }
}

function createModuleEntrySource(lucideScript, workerSources, embeddedFonts) {
  return `
import './js/3dView.js';
import './js/stl.js';

window.__APP_EMBEDDED_WORKER_SOURCES__ = ${JSON.stringify(workerSources, null, 2)};
window.__APP_EMBEDDED_FONTS__ = ${JSON.stringify(embeddedFonts, null, 2)};

window.__APP_WORKER_URLS__ = {};
window.getAppWorkerUrl = function(name) {
  if (window.__APP_WORKER_URLS__[name]) {
    return window.__APP_WORKER_URLS__[name];
  }

  const source = window.__APP_EMBEDDED_WORKER_SOURCES__[name];
  if (!source) {
    return '';
  }

  const blob = new Blob([source], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  window.__APP_WORKER_URLS__[name] = url;
  return url;
};
${lucideScript}
`;
}

async function buildEmbeddedFonts(relativePaths) {
  const entries = await Promise.all(relativePaths.map(async (relativePath) => {
    const absolutePath = path.join(__dirname, relativePath);
    const buffer = await readFile(absolutePath);
    return [relativePath, buffer.toString('base64')];
  }));

  return Object.fromEntries(entries);
}

async function minifyJavaScript(source) {
  const result = await build({
    stdin: {
      contents: source,
      resolveDir: __dirname,
      sourcefile: 'bundle.js'
    },
    bundle: false,
    minify: true,
    sourcemap: false,
    write: false,
    target: ['es2020']
  });

  const output = result.outputFiles.find((file) => file.path.endsWith('.js') || file.path === '<stdout>');
  if (!output) {
    throw new Error('Final JavaScript bundle was not minified');
  }

  return output.text;
}

async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await copyFile(sourcePath, targetPath);
  }
}

async function buildWorkerSources(workerMap) {
  const entries = await Promise.all(Object.entries(workerMap).map(async ([name, files]) => {
    const source = await concatenateScripts(files, '', { stripImportScripts: true, wrapInIife: true });
    return [name, source];
  }));

  return Object.fromEntries(entries);
}

async function concatenateScripts(relativePaths, lucideScript = '', options = {}) {
  const stripImportScripts = options.stripImportScripts === true;
  const wrapInIife = options.wrapInIife === true;
  const parts = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(__dirname, relativePath);
    let content = await readFile(absolutePath, 'utf8');
    content = content.replace(/^#!.*\n/, '');
    content = content.replace(/^[ \t]*\/\/[#@]\s*sourceMappingURL=.*$/gm, '');
    content = content.replace(/\/\*[#@]\s*sourceMappingURL=.*?\*\//gs, '');
    if (stripImportScripts) {
      content = content.replace(/^[ \t]*(?:self\.)?importScripts\([^\n]*\);?\s*$/gm, '');
    }
    parts.push(`/* ${relativePath} */\n${content.trim()}\n`);
  }

  if (lucideScript) {
    parts.push(`/* inline lucide bootstrap */\n${lucideScript}\n`);
  }

  const source = parts.join('\n');
  return wrapInIife ? `(()=>{\n${source}\n})();` : source;
}

async function writeOutputFiles(outputFiles) {
  for (const file of outputFiles) {
    await mkdir(path.dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents);
  }
}

function createDistHtml(bodyMarkup) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Freazy KAM</title>
  <link rel="shortcut icon" type="image/x-icon" href="./favicon.ico">
  <link rel="stylesheet" href="./app.css">
</head>
<body>
  ${bodyMarkup}
  <script src="./bundle.js"></script>
</body>
</html>
`;
}
