const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),report=[];
const url=process.env.TEST_URL||pathToFileURL(path.join(root,'index.html')).href;
const variants=[['desktop',1440,1000,false],['tablet',820,1180,true],['phone',390,844,true],['small-phone',320,568,true],['landscape',844,390,true]];
const selectedVariants=process.env.TEST_PUBLIC_SMOKE==='1'?variants.filter(([device])=>['desktop','phone'].includes(device)):variants;
const expected={width:'14',intensity:'65',smoothing:'104',duration:'3.2',spread:'25',backgroundDim:'19',ambientIntensity:'0',ambientSpeed:'0.1',glow:true,bloom:true,filament:true,arrow:false,additive:true,poster:true,ambient:false};
(async()=>{
  for(const [name,engine] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
    const opts={headless:true};if(name==='chromium'&&process.env.CHROMIUM_EXECUTABLE)opts.executablePath=process.env.CHROMIUM_EXECUTABLE;
    const browser=await engine.launch(opts);
    try{
      for(const [device,width,height,touch] of selectedVariants){
        const context=await browser.newContext({viewport:{width,height},hasTouch:touch,deviceScaleFactor:2,acceptDownloads:true});
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        const response=await page.goto(url);if(url.startsWith('https:'))assert.equal(response.status(),200);
        await page.waitForFunction(()=>!document.getElementById('makeBtn').disabled);
        assert.deepEqual(await page.locator('[data-option]').evaluateAll(inputs=>Object.fromEntries(inputs.map(i=>[i.dataset.option,i.type==='checkbox'?i.checked:i.value]))),expected);
        assert(!(await page.locator('#effectControls').isVisible()));assert.equal(await page.locator('select').count(),0);
        assert.equal(await page.locator('.color-choice:visible').count(),4);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        const baseline=await page.locator('#art').evaluate(c=>c.toDataURL());
        await page.waitForTimeout(120);assert((await page.locator('#art').evaluate(c=>c.toDataURL()))===baseline,'background must be static');
        await page.locator('[data-key="purple"]').click();await page.locator('#art').scrollIntoViewIfNeeded();
        const r=await page.locator('#art').boundingBox();
        if(touch&&name==='chromium'){
          const session=await context.newCDPSession(page),scroll=await page.evaluate(()=>scrollY);
          await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.15,y:r.y+r.height*.4}]});
          for(let i=1;i<=24;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*(.15+i*.026),y:r.y+r.height*(.4+Math.sin(i/5)*.14)}]});
          await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.evaluate(()=>scrollY),scroll);
        }else if(touch){
          await page.locator('#art').evaluate(c=>{
            const r=c.getBoundingClientRect();c.setPointerCapture=()=>{};c.hasPointerCapture=()=>false;
            const send=(type,x,y)=>c.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:r.x+x*r.width,clientY:r.y+y*r.height,bubbles:true}));
            send('pointerdown',.15,.4);for(let i=1;i<=32;i++)send('pointermove',.15+i*.02,.4+Math.sin(i/5)*.14);send('pointerup',.79,.42);
          });
        }else{
          await page.mouse.move(r.x+r.width*.15,r.y+r.height*.4);await page.mouse.down();
          for(let i=1;i<=32;i++)await page.mouse.move(r.x+r.width*(.15+i*.02),r.y+r.height*(.4+Math.sin(i/5)*.14));await page.mouse.up();
        }
        assert.equal(await page.locator('#strokeCount').textContent(),'1 道頻率');
        await page.waitForFunction(before=>document.getElementById('art').toDataURL()!==before,baseline,{timeout:10000});
        await page.locator('#makeBtn').click();await page.waitForFunction(()=>document.getElementById('downloadLink').hasAttribute('href'));
        await page.locator('#resultImage').evaluate(i=>i.decode());
        assert.deepEqual(await page.locator('#resultImage').evaluate(i=>[i.naturalWidth,i.naturalHeight]),[1080,1350]);
        assert.equal(await page.locator('#exportDialog select').count(),0);
        const frozen=await page.locator('#resultImage').getAttribute('src');
        const pending=page.waitForEvent('download');await page.locator('#downloadLink').click();const download=await pending;assert.equal(download.suggestedFilename(),'soul-frequency-feed.png');
        if(name==='chromium'&&device==='desktop')await download.saveAs(path.join(root,'preview-feed.png'));
        await page.locator('#closeBtn').click();await page.setViewportSize({width:height,height:width});
        await page.locator('#makeBtn').click();await page.locator('#resultImage').evaluate(i=>i.decode());assert.equal(await page.locator('#resultImage').getAttribute('src'),frozen);
        await page.keyboard.press('Escape');await page.setViewportSize({width,height});
        await page.locator('#freezeBtn').click();await page.locator('#undoBtn').click();assert.equal(await page.locator('#strokeCount').textContent(),'0 道頻率');
        // Exercise both file-share success and cancellation without posting any real content.
        await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{window.sharedFile={name:files[0].name,type:files[0].type};}});});
        await page.locator('#makeBtn').click();await page.waitForFunction(()=>!document.getElementById('shareBtn').disabled);await page.locator('#shareBtn').click();
        assert.deepEqual(await page.evaluate(()=>window.sharedFile),{name:'soul-frequency-feed.png',type:'image/png'});
        await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Canceled','AbortError');}}));
        await page.locator('#shareBtn').click();assert.match(await page.locator('#shareStatus').textContent(),/已取消/);
        await page.locator('#closeBtn').click();
        await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
        await page.locator('#makeBtn').click();await page.waitForFunction(()=>document.getElementById('downloadLink').hasAttribute('href'));
        assert(await page.locator('#shareBtn').isDisabled());assert.match(await page.locator('#shareStatus').textContent(),/下載圖片後開啟 IG/);
        await page.locator('#closeBtn').click();
        if(name==='chromium'&&['desktop','phone'].includes(device))await page.screenshot({path:path.join(root,`public-${device}.png`),fullPage:true});
        assert.deepEqual(errors,[]);report.push({engine:name,device,result:'PASS'});console.log('PASS',name,device);
        await context.close();
      }
    }finally{await browser.close();}
  }
  fs.writeFileSync(path.join(root,url.startsWith('https:')?'live-test-results.json':'test-results.json'),JSON.stringify({url:url.startsWith('https:')?url:'local index.html',cases:report,limits:'Viewport/touch emulation. OS share and real IG completion require physical-device verification.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
