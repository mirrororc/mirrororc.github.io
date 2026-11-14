const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),results=[];
async function metrics(page){return page.locator('#art').evaluate(c=>{
 const out=document.createElement('canvas');out.width=1000;out.height=800;const g=out.getContext('2d');g.drawImage(c,0,0,1000,800);const d=g.getImageData(0,0,1000,800).data;
 let area=0,white=0,body=0;const band=x=>{let n=0;for(let y=180;y<620;y++){const i=(y*1000+x)*4;if(d[i+2]-d[i]>18)n++;}return n;};
 for(let y=180;y<620;y++)for(let x=120;x<900;x++){const i=(y*1000+x)*4,r=d[i],gg=d[i+1],b=d[i+2];if(b-r>18)area++;if(b-r>65&&b-gg>35)body++;}
 // Read the thin core at native resolution; rescaling can average a one-pixel
 // white highlight with its blue neighbors differently across browser engines.
 const native=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
 for(let i=0;i<native.length;i+=4)if(native[i]>215&&native[i+1]>215&&native[i+2]>235)white++;
 return {area,white,body,oldWidth:band(260),freshWidth:band(720)};
});}
async function snapshot(page){return page.locator('#art').evaluate(c=>c.toDataURL());}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]].filter(([name])=>!process.env.TEST_ENGINE||process.env.TEST_ENGINE===name)){
  const launch={headless:true};if(name==='chromium'&&process.env.CHROMIUM_EXECUTABLE)launch.executablePath=process.env.CHROMIUM_EXECUTABLE;
  const browser=await engine.launch(launch),page=await browser.newPage({viewport:{width:1280,height:1150}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(process.env.TEST_URL||pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>!document.getElementById('makeBtn').disabled);
   await page.locator('[data-option="poster"]').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.locator('#art').scrollIntoViewIfNeeded();const r=await page.locator('#art').boundingBox();
   const move=async x=>page.mouse.move(r.x+r.width*x,r.y+r.height*.5);
   await move(.15);await page.mouse.down();for(let i=1;i<=12;i++)await move(.15+i*.0225);
   await page.waitForTimeout(100);const early=await metrics(page),frames=[{label:'POINTER DOWN / 0.1s',src:await snapshot(page)}];
   await page.waitForTimeout(1000);const held=await metrics(page);frames.push({label:'STILL HELD / 1.1s',src:await snapshot(page)});
   assert.equal(await page.locator('#strokeCount').textContent(),'0 道頻率','pointer must still be held');
   assert(held.area>early.area*1.25,'halo must spread significantly before pointerup');
   for(let i=1;i<=22;i++){await move(.42+i*.0195);await page.waitForTimeout(8);}
   await page.waitForFunction(()=>{const c=document.getElementById('art'),out=document.createElement('canvas');out.width=1000;out.height=800;const g=out.getContext('2d');g.drawImage(c,0,0,1000,800);return g.getImageData(720,400,1,1).data[2]>180;});
   const drawing=await metrics(page);frames.push({label:'DRAWING / OLD → FRESH',src:await snapshot(page)});
   console.log('MEASURE',name,JSON.stringify({early,held,drawing}));
   await page.locator('#art').screenshot({path:path.join(root,`neon-${name}-drawing.png`)});
   assert(drawing.freshWidth>0&&drawing.oldWidth>drawing.freshWidth*1.1,'earlier sections must be broader than freshly drawn sections');
   assert(drawing.white>300,'near-white neon filament must be visible');assert(drawing.body>1500,'saturated color body must remain around the white core');
   await page.mouse.up();await page.waitForTimeout(80);const released=await metrics(page);
   assert(released.area>drawing.area*.94,'release must continue the current halo without shrinking/resetting it');
   await page.locator('#freezeBtn').click();const frozen=await snapshot(page);await page.waitForTimeout(200);assert((await snapshot(page))===frozen);
   await page.locator('#makeBtn').click();await page.waitForFunction(()=>document.getElementById('resultImage').naturalHeight===1350);
   assert.deepEqual(await page.locator('#resultImage').evaluate(i=>[i.naturalWidth,i.naturalHeight]),[1080,1350]);
   if(name==='chromium'){
    const image=await page.evaluate(async frames=>{const out=document.createElement('canvas');out.width=1500;out.height=470;const g=out.getContext('2d');g.fillStyle='#11111b';g.fillRect(0,0,1500,470);for(let i=0;i<frames.length;i++){const im=new Image();im.src=frames[i].src;await im.decode();g.fillStyle='#ddd1f3';g.font='20px system-ui';g.fillText(frames[i].label,i*500+10,32);g.drawImage(im,i*500+10,50,480,384);}return out.toDataURL();},frames);
    fs.writeFileSync(path.join(root,'neon-while-drawing.png'),Buffer.from(image.split(',')[1],'base64'));
    const src=await page.locator('#resultImage').getAttribute('src');fs.writeFileSync(path.join(root,'neon-preview.png'),Buffer.from(src.split(',')[1],'base64'));
   }
   assert.deepEqual(errors,[]);results.push({engine:name,early,held,drawing,released,result:'PASS'});console.log('PASS live neon / white core / age ordering / no release reset',name,JSON.stringify({early,held,drawing}));
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(root,'neon-results.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
