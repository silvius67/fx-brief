// FX Brief - local runner. Runs the GBP/USD and EUR/USD briefs side by side,
// saves each report as a page under reports/, rebuilds reports/ultimul.html and
// opens it in the browser.
//
// The two brief.js files are the same code that runs on GitHub Actions for the
// email version; this file only wraps their HTML output for a browser.
//
// Node 18+, no dependencies.
// Usage: node run.js [--no-open] [--pair gbpusd|eurusd]

const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = __dirname;
const REPORTS = path.join(ROOT, 'reports');
const KEEP_DAYS = 30;
const TZ = 'Europe/Bucharest';
const PAIRS = [
  { id: 'gbpusd', name: 'GBP/USD' },
  { id: 'eurusd', name: 'EUR/USD' },
];

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const pi = args.indexOf('--pair');
const only = pi >= 0 ? args[pi + 1] : null;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function stamp(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  // Some engines print midnight as hour 24.
  return `${p.year}-${p.month}-${p.day}_${String(+p.hour % 24).padStart(2, '0')}${p.minute}`;
}

// Each brief writes subject.txt and body.html into its own temp folder.
function runPair(pair) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `fx-brief-${pair.id}-`));
  return new Promise(resolve => {
    execFile(process.execPath, [path.join(ROOT, pair.id, 'brief.js'), '--out-dir', out],
      { cwd: ROOT, timeout: 180000, windowsHide: true },
      (err, stdout, stderr) => {
        try {
          if (err) throw new Error((stderr || err.message).trim().split('\n').pop());
          resolve({ ...pair, ok: true,
            subject: fs.readFileSync(path.join(out, 'subject.txt'), 'utf8').trim(),
            body: fs.readFileSync(path.join(out, 'body.html'), 'utf8') });
        } catch (e) {
          resolve({ ...pair, ok: false, error: e.message });
        } finally {
          fs.rmSync(out, { recursive: true, force: true });
        }
      });
  });
}

const CSS = `
:root { --bg:#f4f5f7; --card:#fff; --fg:#151a22; --soft:#4a5466; --line:#d7dce4; --accent:#1f4e8c; --bad:#a4262c; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e1218; --card:#161c25; --fg:#e4e9f0; --soft:#a3aec0; --line:#2a3342; --accent:#7aa7e6; --bad:#e0787d; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.wrap { max-width: 64rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; display: flex; flex-direction: column; gap: 1.25rem; }
header h1 { margin: 0; font-size: 1.5rem; }
header p, nav { margin: .25rem 0 0; color: var(--soft); font-size: .9rem; }
nav a { color: var(--accent); margin-right: .9rem; }
.report { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 1rem 1.2rem; overflow-x: auto; }
.report h2 { margin-top: 0; font-size: 1.25rem; }
.report h3 { font-size: 1.02rem; margin: 1.4rem 0 .5rem; }
.report table { border-collapse: collapse; font-size: .9rem; margin: .25rem 0; }
.report td, .report th { border: 1px solid var(--line); padding: .35rem .6rem; vertical-align: top; }
.report pre { background: var(--bg); padding: .7rem; border-radius: 4px; font-size: .82rem; overflow-x: auto; }
.report a { color: var(--accent); }
.report hr { border: 0; border-top: 1px solid var(--line); }
.error { border-color: var(--bad); color: var(--bad); }
footer { color: var(--soft); font-size: .8rem; }
`;

function page(title, inner, nav) {
  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><div class="wrap">${nav || ''}${inner}
<footer>Analiză cantitativă pe date publice. Nu constituie consultanță de investiții.</footer>
</div></body></html>`;
}

function section(r) {
  if (!r.ok) return `<section class="report error"><h2>${esc(r.name)}</h2><p>Raportul nu s-a putut genera: ${esc(r.error)}</p></section>`;
  return `<section class="report" id="${r.id}">${r.body}</section>`;
}

function prune() {
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  for (const f of fs.readdirSync(REPORTS)) {
    const full = path.join(REPORTS, f);
    if (f !== 'ultimul.html' && f.endsWith('.html') && fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full);
  }
}

function openInBrowser(file) {
  // Verbatim arguments on Windows, so the path is quoted for cmd ourselves.
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${file}"`]]
    : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
  } catch (e) {
    console.error(`Nu am putut deschide browserul: ${e.message}. Deschide manual ${file}`);
  }
}

(async () => {
  const pairs = PAIRS.filter(p => !only || p.id === only);
  if (!pairs.length) throw new Error(`Pereche necunoscuta: ${only}. Variante: gbpusd, eurusd`);
  const now = new Date();
  const st = stamp(now);
  const results = await Promise.all(pairs.map(runPair));

  fs.mkdirSync(REPORTS, { recursive: true });
  const when = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, dateStyle: 'full', timeStyle: 'short' }).format(now);
  for (const r of results.filter(x => x.ok)) {
    fs.writeFileSync(path.join(REPORTS, `${st}_${r.id}.html`), page(r.subject, section(r)), 'utf8');
  }

  const files = fs.readdirSync(REPORTS).filter(f => /^\d{4}-\d\d-\d\d_\d{4}_\w+\.html$/.test(f)).sort().reverse();
  const label = f => {
    const [, y, mo, d, h, mi, id] = f.match(/^(\d{4})-(\d\d)-(\d\d)_(\d\d)(\d\d)_(\w+)\.html$/);
    return `${d}.${mo} ${h}:${mi} ${(PAIRS.find(p => p.id === id) || { name: id }).name}`;
  };
  const history = files.slice(0, 12).map(f => `<a href="${esc(f)}">${esc(label(f))}</a>`).join('');
  const header = `<header><h1>FX Brief</h1><p>${esc(when)} · ora României</p>`
    + `<nav>${results.map(r => `<a href="#${r.id}">${esc(r.name)}</a>`).join('')}</nav>`
    + (history ? `<nav>Rapoarte anterioare: ${history}</nav>` : '') + '</header>';
  const latest = path.join(REPORTS, 'ultimul.html');
  fs.writeFileSync(latest, page(`FX Brief · ${st.replace('_', ' ')}`, results.map(section).join('\n'), header), 'utf8');
  prune();

  for (const r of results) console.log(r.ok ? `OK     ${r.subject}` : `EROARE ${r.name}: ${r.error}`);
  console.log(`scris ${latest}`);
  if (!noOpen) openInBrowser(latest);
  if (results.every(r => !r.ok)) process.exit(1);
})().catch(e => { console.error('EROARE:', e.message); process.exit(1); });
