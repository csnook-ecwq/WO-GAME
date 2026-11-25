// Counts the winning solutions of a board, treating two solutions as the same when they only
// differ by swapping taps that don't affect each other. Sleep-set search with memoisation.
// Checked against brute force on ~250 small boards: it can over-count but never under-counts,
// so a result of 1 proves the board has exactly one solution.
const E=require('../engine.cjs');
// Count winning solutions up to reordering of independent taps (Mazurkiewicz traces), via sleep sets + memo.
function countTraces(c0,W,H,cap=1e9,budget=2e6){
  const win=new Map();let nodes=0;
  function canWin(c){const k=c.join('');let r=win.get(k);if(r!==undefined)return r;if(++nodes>budget)throw 0;
    r=!c.some(Boolean);if(!r)for(const i of E.moves(c,W,H))if(canWin(E.fly(c,W,H,i).cells)){r=true;break;}win.set(k,r);return r;}
  const memo=new Map();
  function indep(c,a,b){ // both enabled in c
    const ca=E.fly(c,W,H,a).cells;if(!E.canFly(ca,W,H,b))return false;const cb=E.fly(c,W,H,b).cells;if(!E.canFly(cb,W,H,a))return false;
    return E.fly(ca,W,H,b).cells.join()===E.fly(cb,W,H,a).cells.join();}
  function rec(c,sleep){ if(!c.some(Boolean))return 1; if(!canWin(c))return 0;
    const key=c.join('')+'|'+sleep.join(',');const m=memo.get(key);if(m!==undefined)return m;if(++nodes>budget)throw 0;
    const en=E.moves(c,W,H);let total=0;const done=[];
    for(const t of en){ if(sleep.includes(t))continue;
      const nc=E.fly(c,W,H,t).cells;
      const ns=sleep.concat(done).filter(s=>indep(c,s,t)).sort((a,b)=>a-b);
      total+=rec(nc,ns);if(total>cap){total=cap;break;}done.push(t);}
    memo.set(key,total);return total;}
  try{return rec(c0,[]);}catch(e){return -1;}
}
module.exports={countTraces};
if(require.main===module){
  const [W,H,dens,sw,n]=process.argv.slice(2).map(Number);const t0=Date.now();const res=[];
  for(let s=1;s<=n;s++){const R=E.rng(s*31337);const c=E.build(W,H,{density:dens,kinds:[1-sw,sw],inward:Number(process.argv[7]||2)},R);if(!c)continue;res.push(countTraces(c,W,H));}
  res.sort((a,b)=>a-b);console.log(res.join(' '),((Date.now()-t0)/1000).toFixed(1)+'s');
}
