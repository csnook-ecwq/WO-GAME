// Searches Set 1 levels 1-13 to their targets (size, arrow count, swivel share,
// max solutions, random-tap failure rate). usage: node levels.cjs [comma-separated indexes]
const E=require('../engine.cjs');const {countTraces}=require('./traces.cjs');const fs=require('fs');
const SPECS=[
 [3,3,3,0,99,0],[4,4,5,0,99,0],[4,5,8,0,99,0],
 [4,5,8,0.3,99,0.15,0.35],[5,5,11,0.35,99,0.3,0.5],[5,6,15,0.4,3,0.4],[5,6,18,0.5,2,0.5],
 [6,6,22,0.5,2,0.6],[6,7,26,0.55,1,0.7],[6,7,30,0.6,1,0.75],[6,7,34,0.6,1,0.8],[6,8,38,0.65,1,0.85],[6,8,42,0.65,1,0.88]];
const which=process.argv[2]?process.argv[2].split(',').map(Number):SPECS.map((_,i)=>i);
const out={};
for(const li of which){const [W,H,N,sw,tG,trM,trX=1]=SPECS[li];const R=E.rng(1000+li*17);
  const score=b=>{const s=E.solve(b,W,H,30000);if(!s||!s.ok)return null;const t=sw?countTraces(b,W,H,50,150000):1;const tr=E.trapRate(b,W,H,R,300);
    const free0=E.moves(b,W,H).length;
    return {t,tr,free0,cost:(t<0?60:Math.max(0,t-tG))+Math.max(0,trM-tr)*20+Math.max(0,tr-trX)*20+(li<3?Math.abs(free0-2)*0.5+ (li===2?Math.max(0,4-longestChain(b,W,H)):0):0)};};
  let c=null,cur=null;while(!cur){c=E.build(W,H,{density:N/(W*H),kinds:[1-sw,sw],inward:1.5},R);if(c)cur=score(c);}
  const t0=Date.now();
  for(let it=0;it<4000&&cur.cost>0&&Date.now()-t0<240000;it++){
    let n=c.slice();
    if(R()<0.3){const full=n.map((v,i)=>v?i:-1).filter(i=>i>=0),emp=n.map((v,i)=>v?-1:i).filter(i=>i>=0);if(emp.length){const a=full[R()*full.length|0],b=emp[R()*emp.length|0];n[b]=n[a];n[a]=0;}}
    else{const full=n.map((v,i)=>v?i:-1).filter(i=>i>=0);const i=full[R()*full.length|0];n[i]=E.mk(R()<sw?1:0,R()*4|0);}
    if(R()<0.15){c2=E.build(W,H,{density:N/(W*H),kinds:[1-sw,sw],inward:1.5},R);if(c2)n=c2;}
    const v=score(n);if(v&&v.cost<=cur.cost){c=n;cur=v;}
  }
  out[li]={W,H,cells:c,...cur,secs:(Date.now()-t0)/1000};console.error(li+1,JSON.stringify({W,H,t:cur.t,tr:cur.tr,free0:cur.free0,cost:cur.cost}));
}
function longestChain(b,W,H){ // length of longest forced dependency (rough): number of solve steps where only one move was possible
  let c=b,k=0;for(;;){const m=E.moves(c,W,H);if(!m.length)break;if(m.length===1)k++;c=E.fly(c,W,H,m[0]).cells;}return k;}
fs.writeFileSync('levels_'+which.join('_')+'.json',JSON.stringify(out));
