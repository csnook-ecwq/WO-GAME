// Store screenshots: capture the real game at iPhone 6.7"/6.9" size, then frame each with a caption.
const {chromium}=require('playwright');const fs=require('fs');
const path=require('path');const OUT=path.join(__dirname,'../store/screenshots/');fs.mkdirSync(OUT,{recursive:true});
const RAW=require('os').tmpdir()+'/unwind_raw_';
(async()=>{const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:430,height:932},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 await ctx.addInitScript(()=>{try{localStorage.setItem('unwind.tutorialDone','true');}catch(e){}});
 const p=await ctx.newPage();await p.goto('file://'+path.join(__dirname,'../../index.html')+'');
 // a player a little way in: some levels cleared, stars, a streak
 await p.evaluate(()=>{const d=new Date(),k=t=>t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
   const stars={},cleared={};const add=(pk,df,n,s)=>{for(let i=1;i<=n;i++){stars[`L:${pk}:${df}:${i}`]=s[(i-1)%s.length];(cleared[pk+'-'+df]=cleared[pk+'-'+df]||{})[i]=1;}};
   add('classic','hard',14,[3,3,2]);add('shapes','expert',9,[3,2,3]);add('cube','hard',6,[3]);add('maze','hard',3,[2]);add('prism','medium',2,[3]);
   const daily={};for(let j=1;j<=5;j++){const t=new Date();t.setDate(t.getDate()-j);['shape','cube','rush'].forEach(x=>daily[k(t)+':'+x]=1);}
   daily[k(d)+':shape']=1;
   localStorage.setItem('unwind.progress',JSON.stringify({cleared,stars,best:{},daily,endlessBest:{}}));
   const y=new Date();y.setDate(y.getDate());localStorage.setItem('unwind.stats',JSON.stringify({solved:34,byKey:{},arrows:5210,mistakes:12,hints:6,undos:0,ms:9e6,perfect:21,streak:6,lastDaily:k(d)}));
   localStorage.setItem('unwind.prefs',JSON.stringify({pack:'shapes',diff:'expert',mode:'classic'}));});
 await p.reload();await p.waitForTimeout(1200);
 await p.screenshot({path:RAW+'1.png'});
 const ready=()=>p.waitForFunction(()=>window.__unwind.G&&window.__unwind.G.P&&!window.__unwind.G.loading,null,{timeout:60000});
 // dense heart board, a few arrows already gone
 await p.click('.pack[data-pack=shapes]');await p.click('.dchip[data-d=extreme]');await p.evaluate(()=>{});
 await p.evaluate(()=>{const pr=JSON.parse(localStorage.getItem('unwind.progress'));pr.cleared['shapes-extreme']={};localStorage.setItem('unwind.progress',JSON.stringify(pr));});
 await p.click('.lv[data-n="1"]',{force:true});await ready();
 await p.evaluate(()=>{const U=window.__unwind;const o=U.E.solve(U.G.P.arrows,U.G.removed).order;for(const i of o.slice(0,18))U.attempt(i);});await p.waitForTimeout(250);await p.evaluate(()=>document.querySelector('#toast').classList.remove('on'));await p.waitForTimeout(300);
 await p.screenshot({path:RAW+'2.png'});await p.click('#backBtn');await p.click('#packBack');
 // cube
 await p.click('.pack[data-pack=cube]');await p.click('.dchip[data-d=expert]');await p.click('.mode[data-m=relax]');await p.click('.lv[data-n="1"]',{force:true});await ready();await p.waitForTimeout(400);await p.evaluate(()=>document.querySelector('#toast').classList.remove('on'));await p.waitForTimeout(300);
 await p.screenshot({path:RAW+'3.png'});await p.click('#backBtn');await p.click('#packBack');
 // daily
 await p.click('#dailyBanner');await p.waitForTimeout(900);await p.screenshot({path:RAW+'4.png'});await p.click('#dailyBack');
 // a win
 await p.click('.pack[data-pack=classic]');await p.click('.dchip[data-d=hard]');await p.click('.mode[data-m=classic]');await p.click('.lv.next',{force:true});await ready();
 await p.evaluate(()=>{const U=window.__unwind;for(const i of U.E.solve(U.G.P.arrows,U.G.removed).order)U.attempt(i);U.G.elapsed=94000;});await p.waitForTimeout(2600);
 await p.screenshot({path:RAW+'5.png'});
 // frame them
 const frames=[['Untangle<br>every arrow','#2f6df6',1],['Hundreds of<br>winding arrows','#ec4f7a',2],['Puzzles in 3D,<br>on every face','#7c5cff',3],['New challenges<br>every day','#ff6a2b',4],['Earn all<br>three stars','#0fa58f',5]];
 const fp=await b.newPage({viewport:{width:1290,height:2796},deviceScaleFactor:1});
 for(const [cap,col,n] of frames){
   const img='data:image/png;base64,'+fs.readFileSync(RAW+n+'.png').toString('base64');
   await fp.setContent(`<html><body style="margin:0;width:1290px;height:2796px;overflow:hidden;background:linear-gradient(170deg,${col},color-mix(in srgb,${col} 55%,#0b1026));font-family:'Arial Black',Arial,sans-serif">
     <div style="text-align:center;color:#fff;font-weight:900;font-size:118px;line-height:1.08;padding-top:170px;letter-spacing:-1px;text-shadow:0 6px 0 rgba(0,0,0,.15)">${cap}</div>
     <img src="${img}" style="position:absolute;left:50%;top:640px;width:1010px;transform:translateX(-50%);border-radius:90px;box-shadow:0 40px 90px rgba(0,0,0,.35),0 0 0 18px rgba(255,255,255,.95)"></body></html>`);
   await fp.waitForTimeout(150);await fp.screenshot({path:OUT+`0${n}.png`});console.log('framed',n);
 }
 await b.close();})();
