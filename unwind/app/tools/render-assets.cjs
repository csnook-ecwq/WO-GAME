// Renders assets/source/*.svg to the PNGs @capacitor/assets needs (needs Playwright + Chromium). Then: npm run assets
const {chromium}=require('playwright');const fs=require('fs');
const path=require('path');const src=path.join(__dirname,'../assets/source/'), out=path.join(__dirname,'../assets/');
(async()=>{const b=await chromium.launch();
 for(const [f,o,s,transparent] of [['icon.svg','icon-only.png',1024],['icon-foreground.svg','icon-foreground.png',1024,true],['icon-background.svg','icon-background.png',1024],['splash.svg','splash.png',2732],['splash-dark.svg','splash-dark.png',2732]]){
  const p=await b.newPage({viewport:{width:s,height:s},deviceScaleFactor:1});
  await p.setContent(`<html><body style="margin:0;background:${transparent?'transparent':'#fff'}">${fs.readFileSync(src+f,'utf8').replace('<svg ','<svg width="'+s+'" height="'+s+'" ')}</body></html>`);
  await p.screenshot({path:out+o,omitBackground:!!transparent,clip:{x:0,y:0,width:s,height:s}});await p.close();console.log('wrote',o);}
 await b.close();})();
