// Include original license notices from the locked Windows Rust graph and JS packages.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const metadata = JSON.parse(execFileSync('cargo', ['metadata','--locked','--offline','--format-version','1','--filter-platform','x86_64-pc-windows-msvc'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}));
const resolved = new Set(metadata.resolve.nodes.map(n=>n.id));
const entries = [];
function collect(name, version, license, folder) {
    const texts = [];
    function walk(dir, depth) {
        for (const file of fs.readdirSync(dir,{withFileTypes:true})) {
            if (file.isSymbolicLink()) continue;
            const target = path.join(dir,file.name);
            if (file.isDirectory() && depth===0 && /^(licenses?|legal)$/i.test(file.name)) walk(target,depth+1);
            if (file.isFile() && (depth>0 || /^(licen[cs]e|copying|notice|copyright|unlicense)([._-]|$)/i.test(file.name))) {
                texts.push({name:path.relative(folder,target).replaceAll('\\','/'),text:fs.readFileSync(target,'utf8')});
            }
        }
    }
    walk(folder,0);
    if (!texts.length) {
        const family = { 'alloc-stdlib':'alloc-no-stdlib', selectors:'cssparser', 'tauri-plugin':'tauri' }[name];
        if (family) {
            const sibling=metadata.packages.find(p=>p.name===family);
            if (sibling) walk(path.dirname(sibling.manifest_path),0);
        }
        const notice=name.startsWith('webview2-com')?'webview2-com':name;
        const source=path.join(root,'docs-src/licenses',notice+'.txt');
        if (!texts.length && fs.existsSync(source)) texts.push({name:'Upstream LICENSE',text:fs.readFileSync(source,'utf8')});
    }
    if (!texts.length) throw Error(`Missing original license text: ${name} ${version}`);
    entries.push({name,version,license,texts});
}
for (const pkg of metadata.packages) if(resolved.has(pkg.id) && pkg.source) collect(pkg.name,pkg.version,pkg.license,path.dirname(pkg.manifest_path));
const lock = JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
for (const [location,pkg] of Object.entries(lock.packages)) {
    if (!location || location.includes('@tauri-apps/') || location.includes('@esbuild/') || location.endsWith('/esbuild')) continue;
    const manifest=JSON.parse(fs.readFileSync(path.join(root,location,'package.json'),'utf8'));
    collect(manifest.name,pkg.version,manifest.license || pkg.license,path.join(root,location));
}
collect('Plus Jakarta Sans / JetBrains Mono','bundled','OFL-1.1',path.join(root,'renderer/fonts'));
entries.sort((a,b)=>a.name.localeCompare(b.name));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mumbin — Third-party notices</title><style>body{font:15px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}details{border-bottom:1px solid #ccc;padding:12px 0}summary{cursor:pointer}</style><h1>Mumbin — Third-party notices</h1><p>Original license texts for the Windows dependency graph, including build dependencies, bundled JavaScript and fonts. These licenses apply to their respective components.</p>${entries.map(e=>`<details><summary>${escape(e.name)} ${escape(e.version)} — ${escape(e.license)}</summary>${e.texts.map(t=>`<h3>${escape(t.name)}</h3><pre>${escape(t.text)}</pre>`).join('')}</details>`).join('')}</html>`;
fs.writeFileSync(path.join(root,'docs/third-party-notices.html'),html);
console.log(`Collected original notices for ${entries.length} components`);
