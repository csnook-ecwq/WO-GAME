// Verifies every searched level and writes ../levels.json (code, solution, stats).
// usage: node assemble.cjs nightmare14.log nightmare15.log
// Collect level search results into arrows/levels.json, verifying each one.
const E=require('../engine.cjs');const {countTraces}=require('./traces.cjs');const fs=require('fs');
const all={};
for(const f of fs.readdirSync('.').filter(f=>/^levels_.*\.json$/.test(f)).sort((a,b)=>fs.statSync(a).mtimeMs-fs.statSync(b).mtimeMs))Object.assign(all,JSON.parse(fs.readFileSync(f)));
for(const [li,f] of [[13,process.argv[2]],[14,process.argv[3]]]){if(!f)continue;const line=fs.readFileSync(f,'utf8').trim().split('\n').filter(l=>/^(final|board) /.test(l)).pop();
  const m=line&&line.match(/^(?:final|board) (\{.*?\}) (\[.*\])$/);if(!m)continue;const cells=JSON.parse(m[2]);const W=6,H=cells.length/6;all[li]={W,H,cells,...JSON.parse(m[1])};}
const out=[];const allowStub=process.argv.includes('--stub');
for(let i=0;i<15;i++){let L=all[i];
  if(!L){if(!allowStub)throw 'missing level '+(i+1);const R=E.rng(i+5);const W=6,H=7;let c=null;while(!c)c=E.build(W,H,{density:i>=13?1:0.7,kinds:[0.4,0.6],inward:2},R);L={W,H,cells:c,stub:true};}
  const s=E.solve(L.cells,L.W,L.H,1e6);if(!s||!s.ok)throw 'unsolvable '+(i+1);
  const t=L.stub?null:countTraces(L.cells,L.W,L.H,1e6,5e6);
  const code=L.W+','+L.H+','+L.cells.map(v=>v.toString(36)).join('');
  out.push({level:i+1,code,arrows:L.cells.filter(Boolean).length,solutions:t,firstFree:E.moves(L.cells,L.W,L.H).length,randomTapFail:+E.trapRate(L.cells,L.W,L.H,E.rng(99),2000).toFixed(3),solution:s.path,stub:!!L.stub});
  console.log(JSON.stringify(out[i]).slice(0,160));}
fs.writeFileSync(process.env.OUT||require('path').join(__dirname,'..','levels.json'),JSON.stringify(out,null,1));
