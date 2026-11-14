const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const url=pathToFileURL(path.join(root,'index.html')).href;
const before=pathToFileURL(path.join(root,'versions/v3.1.html')).href;
async function draw(page,key,y=.5) {
  await page.locator(`[data-key="${key}"]`).click();
  await page.locator('#art').scrollIntoViewIfNeeded();
  await page.locator('#art').evaluate((c,y)=>{
    const r=c.getBoundingClientRect();c.setPointerCapture=()=>{};c.hasPointerCapture=()=>false;
    const send=(type,x,y,t)=>{const e=new PointerEvent(type,{pointerId:11,pointerType:'pen',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:r.x+x*r.width,clientY:r.y+y*r.height,bubbles:true});Object.defineProperty(e,'timeStamp',{value:t});c.dispatchEvent(e);};
    send('pointerdown',.15,y,0);
    for(let i=1;i<=100;i++)send('pointermove',.15+i*.007,y+Math.sin(i*.045)*.06,i*8.33);
    send('pointerup',.85,y+Math.sin(4.5)*.06,841);
  },y);
}
async function open(page,target) {
  await page.goto(target);await page.waitForFunction(()=>!document.getElementById('makeBtn').disabled);
  // A neutral dark test surface isolates pigment hue and spatial diffusion from the poster.
  await page.locator('[data-option="poster"]').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(80);
}
async function sample(page) {
  return page.locator('#art').evaluate(c=>{
    const a=document.createElement('canvas');a.width=1000;a.height=800;const g=a.getContext('2d');g.drawImage(c,0,0,1000,800);
    const d=g.getImageData(0,0,1000,800).data;
    let area=0,outer=0,dominance=0,count=0;
    for(let y=80;y<720;y++)for(let x=80;x<920;x++){
      const i=(y*1000+x)*4,r=d[i],gg=d[i+1],b=d[i+2];
      if(Math.max(r,gg,b)-Math.min(r,gg,b)>17){area++;if(y<330||y>460)outer++;}
      if(b>70&&b>r*1.5&&b>gg){dominance+=(b-r)/b;count++;}
    }
    return {area,outer,dominance:count?dominance/count:0};
  });
}
(async()=>{
  const results=[];
  for(const [name,engine] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
    const config={headless:true};if(name==='chromium'&&process.env.CHROMIUM_EXECUTABLE)config.executablePath=process.env.CHROMIUM_EXECUTABLE;
    const browser=await engine.launch(config),page=await browser.newPage({viewport:{width:1280,height:1200}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    try{
      await open(page,url);await draw(page,'blue');await page.waitForTimeout(80);const early=await sample(page);
      await page.waitForTimeout(3400);const late=await sample(page);
      assert(late.area>early.area*1.4,'visible pigment area must expand substantially');
      assert(late.outer>early.outer+100,'pigment must reach beyond the former halo footprint');
      assert(late.dominance>.65,'expanded pigment must retain vivid blue instead of washing toward white');
      await page.locator('#freezeBtn').click();const frame=await page.locator('#art').evaluate(c=>c.toDataURL());
      await page.waitForTimeout(200);assert((await page.locator('#art').evaluate(c=>c.toDataURL()))===frame,'freeze must stop diffusion');
      results.push({engine:name,early,late,result:'PASS'});console.log('PASS watercolor expansion / saturation / freeze',name,JSON.stringify({early,late}));
      if(name==='chromium'){
        const cards=[];
        for(const [label,target,elapsed] of [['BEFORE',before,3400],['NEW / 0.1s',url,100],['NEW / 3.2s',url,3400]]){
          await open(page,target);await draw(page,'blue');await page.waitForTimeout(elapsed);
          cards.push({label,src:await page.locator('#art').evaluate(c=>c.toDataURL())});
        }
        const image=await page.evaluate(async cards=>{
          const c=document.createElement('canvas');c.width=1500;c.height=470;const g=c.getContext('2d');g.fillStyle='#11111b';g.fillRect(0,0,c.width,c.height);
          for(let i=0;i<cards.length;i++){const img=new Image();img.src=cards[i].src;await img.decode();g.fillStyle='#ddd1f3';g.font='22px system-ui';g.fillText(cards[i].label,i*500+15,35);g.drawImage(img,i*500+10,55,480,384);}return c.toDataURL();
        },cards);
        fs.writeFileSync(path.join(root,'watercolor-comparison.png'),Buffer.from(image.split(',')[1],'base64'));
        await open(page,url);
        for(const [i,key] of ['blue','coral','purple','green'].entries())await draw(page,key,.2+i*.2);
        await page.waitForTimeout(3400);
        await page.locator('#makeBtn').click();await page.waitForFunction(()=>document.getElementById('resultImage').naturalHeight===1350);
        const src=await page.locator('#resultImage').getAttribute('src');fs.writeFileSync(path.join(root,'watercolor-colors.png'),Buffer.from(src.split(',')[1],'base64'));
      }
      assert.deepEqual(errors,[]);
    }finally{await browser.close();}
  }
  fs.writeFileSync(path.join(root,'appearance-results.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
