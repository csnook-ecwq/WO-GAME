// ===== ENGINE (shared with game) =====
const DX=[0,1,0,-1], DY=[-1,0,1,0];
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const kindOf=v=>(v-1)>>2, dirOf=v=>(v-1)&3, mk=(k,d)=>1+k*4+(d&3);
// kind 0 plain, 1 turns cw, 2 turns ccw, 3 flips
const TURN=[0,1,3,2];
function canFly(c,W,H,i){const v=c[i];if(!v)return false;const d=dirOf(v);let x=i%W+DX[d],y=(i/W|0)+DY[d];
  while(x>=0&&y>=0&&x<W&&y<H){if(c[y*W+x])return false;x+=DX[d];y+=DY[d];}return true;}
function neighbors(W,H,i){const x=i%W,y=i/W|0,r=[];for(let d=0;d<4;d++){const nx=x+DX[d],ny=y+DY[d];if(nx>=0&&ny>=0&&nx<W&&ny<H)r.push(ny*W+nx);}return r;}
function fly(c,W,H,i){const n=c.slice();n[i]=0;const turned=[];for(const j of neighbors(W,H,i)){const v=n[j];if(!v)continue;const k=kindOf(v);if(TURN[k]){n[j]=mk(k,dirOf(v)+TURN[k]);turned.push(j);}}return {cells:n,turned};}
function moves(c,W,H){const r=[];for(let i=0;i<c.length;i++)if(canFly(c,W,H,i))r.push(i);return r;}
function solve(c,W,H,budget=200000){ // returns {ok,path} or null if budget exceeded
  const dead=new Set();let nodes=0;const path=[];
  function rec(c,left){if(left===0)return true;if(++nodes>budget)throw 0;const key=c.join('');if(dead.has(key))return false;
    for(const i of moves(c,W,H)){path.push(i);if(rec(fly(c,W,H,i).cells,left-1))return true;path.pop();}
    dead.add(key);return false;}
  try{const left=c.filter(Boolean).length;return rec(c,left)?{ok:true,path:path.slice()}:{ok:false};}catch(e){return null;}
}
// count winning move sequences, capped
function countSolutions(c,W,H,cap=1e6,budget=2e6){const memo=new Map();let nodes=0;
  function rec(c,left){if(left===0)return 1;const key=c.join('');if(memo.has(key))return memo.get(key);if(++nodes>budget)throw 0;
    let s=0;for(const i of moves(c,W,H)){s+=rec(fly(c,W,H,i).cells,left-1);if(s>cap){s=cap;break;}}memo.set(key,s);return s;}
  try{return rec(c,c.filter(Boolean).length);}catch(e){return -1;}}
// random playout success rate: tap a random free arrow each step
function trapRate(c,W,H,R,n=200){let win=0;for(let t=0;t<n;t++){let b=c;for(;;){const m=moves(b,W,H);if(!m.length)break;b=fly(b,W,H,m[R()*m.length|0]).cells;}if(!b.some(Boolean))win++;}return 1-win/n;}
function clearLine(c,W,H,i){for(let d=0;d<4;d++){let x=i%W+DX[d],y=(i/W|0)+DY[d],ok=true;
  while(x>=0&&y>=0&&x<W&&y<H){if(c[y*W+x]){ok=false;break;}x+=DX[d];y+=DY[d];}if(ok)return true;}return false;}
// would filling cell i leave some empty cell in its row or column with no clear line out?
function sealsNothing(c,W,H,i){c[i]=1;const x0=i%W,y0=i/W|0;let ok=true;
  for(let x=0;x<W&&ok;x++){const j=y0*W+x;if(!c[j]&&!clearLine(c,W,H,j))ok=false;}
  for(let y=0;y<H&&ok;y++){const j=y*W+x0;if(!c[j]&&!clearLine(c,W,H,j))ok=false;}
  c[i]=0;return ok;}
// reverse construction: guarantees solvable
function build(W,H,opt,R){
  const N=Math.round(W*H*opt.density);const c=new Array(W*H).fill(0);const order=[];
  const depth=i=>{const x=i%W,y=i/W|0;return Math.min(x,y,W-1-x,H-1-y);};
  for(let placed=0;placed<N;placed++){
    const cand=[];
    for(let i=0;i<c.length;i++){if(c[i])continue;for(let d=0;d<4;d++){let x=i%W+DX[d],y=(i/W|0)+DY[d],ok=true;
      while(x>=0&&y>=0&&x<W&&y<H){if(c[y*W+x]){ok=false;break;}x+=DX[d];y+=DY[d];}
      if(ok)cand.push([i,d,Math.pow(1+depth(i),opt.inward||2)*(1+ (opt.dirBias?opt.dirBias(i,d):0))]);}}
    if(!cand.length)return null;
    // pick a weighted candidate that doesn't seal any other empty cell off from every edge
    let pick=null;
    while(cand.length){
      let tot=cand.reduce((a,b)=>a+b[2],0),r=R()*tot,pi=cand.length-1;for(let q=0;q<cand.length;q++){r-=cand[q][2];if(r<=0){pi=q;break;}}
      const cd=cand[pi];if(sealsNothing(c,W,H,cd[0])){pick=cd;break;}
      const bad=cd[0];for(let q=cand.length-1;q>=0;q--)if(cand[q][0]===bad)cand.splice(q,1);
    }
    if(!pick)return null;
    const [i,d]=pick;
    // un-turn neighbours (inverse of fly)
    for(const j of neighbors(W,H,i)){const v=c[j];if(!v)continue;const k=kindOf(v);if(TURN[k])c[j]=mk(k,dirOf(v)-TURN[k]+4);}
    let k=0;const r2=R();let acc=0;for(let kk=0;kk<opt.kinds.length;kk++){acc+=opt.kinds[kk];if(r2<acc){k=kk;break;}}
    c[i]=mk(k,d);order.push(i);
  }
  c.solution=order.reverse();
  return c;
}
// ===== /ENGINE =====
if(typeof module!=='undefined')module.exports={DX,DY,rng,kindOf,dirOf,mk,canFly,fly,moves,solve,countSolutions,trapRate,build,neighbors};
