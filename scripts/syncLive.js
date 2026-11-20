// Publish an allowlisted root snapshot; never push private development ancestry.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const repo = 'markmarkinson/mumbin';
const roots = new Set(['crates','src-tauri','renderer','tests','tools','scripts','docs','docs-src','.cargo']);
const files = new Set(['LICENSE','Cargo.toml','Cargo.lock','package.json','package-lock.json','rust-toolchain.toml','deny.toml','.gitignore','.gitattributes']);
function publicPath(file) {
    const parts = file.split('/');
    return (roots.has(parts[0]) || files.has(file)) && !parts.some(p=>['.private','.project','.scratch','node_modules','dist','mumbin_data','gen','__pycache__'].includes(p))
        && !parts.some(p=>/^\.env(?:\.|$)/.test(p)) && !/\.(?:log|pem|key|pfx|p12)$/i.test(file) && file !== 'scripts/journal.mjs';
}
function synchronize(push=false) {
    const run = (args,options={})=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024,...options}).trim();
    if(run(['status','--porcelain'])) throw Error('Commit development changes before preparing the public snapshot.');
    if(run(['remote','get-url','origin'])===`https://github.com/${repo}.git`) throw Error('Origin must remain the private development repository.');
    if(run(['remote','get-url','live'])!==`https://github.com/${repo}.git`) throw Error('Unexpected live remote.');
    const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'mumbin-live-index-'));
    const env={...process.env,GIT_INDEX_FILE:path.join(temporary,'index')};
    try {
        run(['read-tree','--empty'],{env});
        const lines=run(['ls-files','--stage']).split('\n');
        const selected=[];
        for(const line of lines){
            const match=line.match(/^(\d+) ([a-f0-9]+) 0\t(.+)$/);
            if(!match) throw Error('Unmerged or unsupported path');
            const [,mode,oid,file]=match;
            if(!publicPath(file)) continue;
            if(mode!=='100644' && mode!=='100755') throw Error(`No links or submodules in public snapshot: ${file}`);
            selected.push(`${mode} ${oid}\t${file}\n`);
        }
        const readme=run(['rev-parse','HEAD:docs-src/README.public.md']);
        selected.push(`100644 ${readme}\tREADME.md\n`);
        run(['update-index','--index-info'],{env,input:selected.join('')});
        const tree=run(['write-tree'],{env});
        const list=run(['ls-tree','-r','--name-only',tree]).split('\n');
        for(const required of ['README.md','docs/index.html','docs/en/index.html','Cargo.toml','tools/mumbin_decrypt.py']) if(!list.includes(required)) throw Error(`Missing ${required}`);
        if(list.some(p=>/^(\.project|\.private|STATE\.md|CLAUDE\.md|AGENTS\.md)/.test(p))) throw Error('Private file in snapshot');
        fs.mkdirSync(path.join(root,'.scratch'),{recursive:true});
        fs.writeFileSync(path.join(root,'.scratch/live-files.txt'),list.join('\n')+'\n');
        console.log(`Public snapshot: ${list.length} files. Private history and project records excluded.`);
        if(!push){console.log('Dry run. Use --push to publish.');return;}
        const refs=run(['ls-remote','--heads','--tags','live']).split('\n').filter(Boolean).map(line=>line.split(/\s+/));
        const email=run(['config','user.email']);
        if(!email.endsWith('@users.noreply.github.com')) throw Error('Use a GitHub noreply identity for public commits.');
        const commit=run(['commit-tree',tree],{input:'Publish current Mumbin source and website\n'});
        if(run(['rev-list','--count',commit])!=='1') throw Error('Snapshot unexpectedly contains ancestry');
        const destinations=['refs/heads/main','refs/tags/current'];
        const leases=destinations.map(ref=>`--force-with-lease=${ref}:${refs.find(([,name])=>name===ref)?.[0]||''}`);
        run(['push','--atomic',...leases,'live',...destinations.map(ref=>`${commit}:${ref}`)]);
        console.log(`Published ${commit}: one root commit, main and current.`);
    } finally {
        // Only this invocation's freshly created, named temporary index directory.
        if(path.dirname(temporary)!==path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('mumbin-live-index-')) throw Error('Unexpected temporary path');
        fs.rmSync(temporary,{recursive:true,force:true});
    }
}
module.exports={publicPath,synchronize};
if(require.main===module)try{synchronize(process.argv.includes('--push'));}catch(e){console.error(e.message);process.exitCode=1;}
