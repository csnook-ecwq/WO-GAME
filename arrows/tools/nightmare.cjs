// Hill-climbs a full board toward exactly one solution, then toward more tempting wrong taps.
// usage: node nightmare.cjs W H swivelShare seed iterations [widenIterations] > out.log
const E=require('../engine.cjs');const {countTraces}=require('./traces.cjs');
const [W,H,sw,seed,iters]=process.argv.slice(2).map(Number);
const R=E.rng(seed*7777+1);
function width(c,n=60){let tot=0,steps=0;for(let t=0;t<n;t++){let b=c;for(;;){const m=E.moves(b,W,H);if(!m.length)break;tot+=m.length;steps++;b=E.fly(b,W,H,m[R()*m.length|0]).cells;}}return tot/steps;}
let c=null;for(let t=0;t<500&&!c;t++)c=E.build(W,H,{density:1,kinds:[1-sw,sw],inward:2},R);
const score=b=>{const s=E.solve(b,W,H,30000);if(!s||!s.ok)return null;const t=countTraces(b,W,H,50,150000);return {t,w:width(b)};};
let cur=null;while(!cur){c=null;for(let t=0;t<500&&!c;t++)c=E.build(W,H,{density:1,kinds:[1-sw,sw],inward:2},R);cur=score(c);}console.log('start',cur);const t0=Date.now();
const better=(a,b)=> (a.t>0&&b.t>0)?(a.t<b.t||(a.t===b.t&&a.w<=b.w)):(a.t>0&&b.t<0)?true:(a.t<0&&b.t>0)?false:a.w<=b.w;
for(let it=0;it<iters&&cur.t!==1;it++){
  const n=c.slice();const nm=1+(R()*2|0);
  for(let q=0;q<nm;q++){const i=R()*n.length|0;const k=R()<sw?1:0;n[i]=E.mk(k,R()*4|0);}
  const v=score(n);if(!v)continue;
  if(better(v,cur)){if(v.t!==cur.t||Math.abs(v.w-cur.w)>0.2)console.log('it',it,v.t,v.w.toFixed(2),((Date.now()-t0)/1000).toFixed(0)+'s');c=n;cur=v;}
}
const P2=Number(process.argv[7]||1500);console.log('board',JSON.stringify(cur),JSON.stringify(c));
for(let it=0;it<P2&&cur.t===1;it++){const n=c.slice();const i=R()*n.length|0;n[i]=E.mk(R()<sw?1:0,R()*4|0);const v=score(n);if(v&&v.t===1&&v.w>=cur.w){c=n;cur=v;console.log('board',JSON.stringify(cur),JSON.stringify(c));}}
cur.trap=E.trapRate(c,W,H,R,2000);cur.free0=E.moves(c,W,H).length;
console.log('final',JSON.stringify(cur),JSON.stringify(c));
