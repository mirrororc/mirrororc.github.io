(() => {
  'use strict';
  // All rendering lives in this logical space. Device size never changes stored geometry.
  const SIZE = {width:1000, height:1250};
  const DEFAULTS = Object.freeze({width:22,intensity:65,smoothing:104,duration:3.2,spread:25,
    backgroundDim:19,ambient:false,ambientIntensity:0,ambientSpeed:0.1,
    glow:true,bloom:true,filament:true,arrow:false,additive:true,poster:true});
  const LIMITS = Object.freeze({strokes:160,points:6000,sampleDistance:3,dpr:2});
  // Pigment is composited over the background, and only stroke intersections brighten.
  // These controls stay in source; the public effect panel remains hidden.
  const WATERCOLOR = Object.freeze({enabled:true,resolution:0.25,opacity:1.08,spacing:7,
    initialSigma:4,spreadScale:2.4,coreOpacity:0.96,filamentWhiteness:0.96,
    filamentOpacity:0.98,filamentWidth:0.20});
  const COLORS = {
    blue:{hex:'#168aff',label:'木吉他 × 深夜獨處的沉澱'},
    coral:{hex:'#ff4938',label:'電吉他 × 現場的熱烈碰撞'},
    purple:{hex:'#9b32ff',label:'合成器 × 空間感的靈魂吟唱'},
    green:{hex:'#0fc966',label:'節奏鼓點 × 自由生長的生命力'}
  };
  const $ = id => document.getElementById(id);
  const canvas = $('art'), view = canvas.getContext('2d');
  const layer = () => Object.assign(document.createElement('canvas'),SIZE);
  const artwork = layer(), ctx = artwork.getContext('2d');
  const settled = layer(), settledCtx = settled.getContext('2d');
  const ink = layer(), inkCtx = ink.getContext('2d');
  const foreground = layer(), foregroundCtx = foreground.getContext('2d');
  const kernel = Object.assign(document.createElement('canvas'), {width:128,height:128});
  const kernelCtx = kernel.getContext('2d'), kernelImage = kernelCtx.createImageData(128,128);
  const kernelAlpha = FrequencyPigment.kernelAlpha(128);
  for(let i=0;i<kernelAlpha.length;i++) {
    kernelImage.data[i*4]=kernelImage.data[i*4+1]=kernelImage.data[i*4+2]=255;
    kernelImage.data[i*4+3]=kernelAlpha[i];
  }
  kernelCtx.putImageData(kernelImage,0,0);
  const poster = new Image();
  let options = {...DEFAULTS}, selected='blue', strokes=[], current=null;
  let activePointer=null, frozen=false, freezeAt=0, frozenImage=null;
  let clock=0, lastFrame=null, lastPaint=-Infinity, frameId=0, baked=0, exportFile=null, exportURL=null, exportGeneration=0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mix = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const say = text => { $('status').textContent=text; };

  // Input samples are filtered before a midpoint-quadratic spline is constructed.
  // Keeping samples separate from Path2D makes undo, resize and future serialization simple.
  function buildPath(points) {
    const path = new Path2D(), first=points[0];
    path.moveTo(first.x,first.y);
    if(points.length===1) { path.arc(first.x,first.y,.05,0,Math.PI*2); return path; }
    for(let i=1;i<points.length-1;i++) {
      const mid=mix(points[i],points[i+1],.5);
      path.quadraticCurveTo(points[i].x,points[i].y,mid.x,mid.y);
    }
    const end=points[points.length-1];
    path.lineTo(end.x,end.y);
    return path;
  }
  function newStroke(p) {
    const start={...p,born:clock};
    return {key:selected,points:[start],lastRaw:p,filtered:p,path:buildPath([start]),born:clock,lastWetBorn:clock,ended:null};
  }
  function sample(p,force=false) {
    if(!current) return;
    const last=current.points[current.points.length-1], raw=current.lastRaw;
    if(distance(raw,p)<.1) return;
    // The pointer-up sample uses the same filter. Never snap an extreme-smoothed tip
    // back to the finger: that creates a visible straight tail at the end of a curve.
    const filtered=FrequencySmoothing.advance(current.filtered,p,options.smoothing,p.t-raw.t);
    if(current.points.length>=LIMITS.points) {
      finish(); say('這一道頻率已達取樣上限，請抬起後繼續下一筆。'); return;
    }
    current.filtered=filtered; current.lastRaw=p;
    if(!force && distance(last,filtered)<LIMITS.sampleDistance) return;
    if(distance(last,filtered)>.01) {
      current.points.push({...filtered,born:clock});
      current.lastWetBorn=clock;
    }
    current.path=buildPath(current.points);
    requestRender();
  }
  function point(e) {
    const r=canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(SIZE.width,(e.clientX-r.left)*SIZE.width/r.width)),
      y:Math.max(0,Math.min(SIZE.height,(e.clientY-r.top)*SIZE.height/r.height)),t:e.timeStamp};
  }
  function finish() {
    if(!current) return;
    current.ended=clock; strokes.push(current); current=null;
    const id=activePointer; activePointer=null;
    if(id!==null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    updateControls(); requestRender();
  }
  canvas.addEventListener('pointerdown',e=>{
    if(frozen || activePointer!==null || !e.isPrimary || e.button!==0) return;
    if(strokes.length>=LIMITS.strokes) { say('畫面已達 160 道頻率，請先匯出或復原部分線條。'); return; }
    e.preventDefault(); activePointer=e.pointerId; canvas.setPointerCapture(e.pointerId);
    current=newStroke(point(e)); requestRender();
  });
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerId!==activePointer || frozen) return;
    e.preventDefault();
    const samples=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
    for(const item of samples.length?samples:[e]) sample(point(item));
  });
  canvas.addEventListener('pointerup',e=>{
    if(e.pointerId!==activePointer) return;
    sample(point(e),true); finish();
  });
  canvas.addEventListener('pointercancel',e=>{if(e.pointerId===activePointer) finish();});
  canvas.addEventListener('lostpointercapture',e=>{if(e.pointerId===activePointer) finish();});
  window.addEventListener('blur',finish);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  function wetField(s) {
    const key = `${s.points.length}:${options.width}`;
    if (s.wetField && s.wetField.key === key) return s.wetField;
    const scale = WATERCOLOR.resolution;
    const width = Math.round(SIZE.width * scale), height = Math.round(SIZE.height * scale);
    const surface = Object.assign(document.createElement('canvas'), {width, height});
    const c = surface.getContext('2d');
    s.wetField = {key,width,height,surface,c,marks:FrequencyPigment.emissions(s.points,WATERCOLOR.spacing)};
    return s.wetField;
  }
  function drawPigment(s, time, color, opacity) {
    const field = wetField(s);
    const c=field.c,scale=WATERCOLOR.resolution;
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
    c.clearRect(0,0,field.width,field.height);
    const config={initialSigma:WATERCOLOR.initialSigma,spread:options.spread*WATERCOLOR.spreadScale,
      opacity:WATERCOLOR.opacity*opacity,spacing:WATERCOLOR.spacing,
      duration:options.duration*1000,reduced:reducedMotion.matches};
    for(const mark of field.marks) {
      const state=FrequencyPigment.state(mark,time,config);
      const radius=state.sigma*3*scale,cos=Math.cos(state.angle),sin=Math.sin(state.angle);
      c.setTransform(cos*radius*state.stretch,sin*radius*state.stretch,
        -sin*radius/state.stretch,cos*radius/state.stretch,
        (mark.x+state.dx)*scale,(mark.y+state.dy)*scale);
      c.globalAlpha=state.opacity;c.drawImage(kernel,-1,-1,2,2);
    }
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-in';
    c.fillStyle=color;c.fillRect(0,0,field.width,field.height);c.globalCompositeOperation='source-over';
    inkCtx.drawImage(field.surface, 0, 0, SIZE.width, SIZE.height);
  }
  // Neon: a near-white thin tube, a saturated color body, and continuously aging emissions.
  function drawStroke(target,s,time) {
    const color=COLORS[s.key].hex, opacity=options.intensity/100, path=s.path;
    inkCtx.clearRect(0,0,SIZE.width,SIZE.height);
    if(WATERCOLOR.enabled && options.bloom) drawPigment(s,time,color,opacity);
    inkCtx.save(); inkCtx.lineCap='round'; inkCtx.lineJoin='round'; inkCtx.strokeStyle=color;
    const pass=(width,alpha,blur=0,style=color,absolute=false)=>{
      inkCtx.lineWidth=width; inkCtx.globalAlpha=absolute?alpha:alpha*opacity;
      inkCtx.shadowColor=color; inkCtx.shadowBlur=blur; inkCtx.strokeStyle=style; inkCtx.stroke(path);
    };
    pass(options.width,WATERCOLOR.coreOpacity,options.glow?9:0);
    if(options.filament) {
      const tint = [1,3,5].map(i => {const v=parseInt(color.slice(i,i+2),16);return Math.round(v+(255-v)*WATERCOLOR.filamentWhiteness);});
      pass(Math.max(2.4,options.width*WATERCOLOR.filamentWidth),WATERCOLOR.filamentOpacity,
        options.glow?6:0,`rgb(${tint.join(',')})`,true);
    }
    if(options.arrow && s.points.length>1) {
      const p=s.points[s.points.length-1], prev=s.points[Math.max(0,s.points.length-4)];
      inkCtx.save(); inkCtx.translate(p.x,p.y); inkCtx.rotate(Math.atan2(p.y-prev.y,p.x-prev.x));
      inkCtx.globalAlpha=opacity; inkCtx.fillStyle=color; inkCtx.shadowBlur=options.glow?10:0;
      inkCtx.beginPath(); inkCtx.moveTo(9,0); inkCtx.lineTo(-8,-7); inkCtx.lineTo(-4,0); inkCtx.lineTo(-8,7); inkCtx.closePath(); inkCtx.fill(); inkCtx.restore();
    }
    inkCtx.restore();
    target.save(); target.globalCompositeOperation=options.additive?'screen':'source-over';
    target.drawImage(ink,0,0); target.restore();
  }
  function invalidate() { baked=0; settledCtx.clearRect(0,0,SIZE.width,SIZE.height); }
  function mature(s) { return s.ended!==null && (!options.bloom || reducedMotion.matches || clock-s.lastWetBorn>=options.duration*1000); }
  function backgroundMoving() { return options.ambient && options.ambientIntensity>0 && !reducedMotion.matches; }
  function drawBackground() {
    ctx.fillStyle='#141622'; ctx.fillRect(0,0,SIZE.width,SIZE.height);
    const phase=reducedMotion.matches?0:clock*.001*options.ambientSpeed;
    if(options.poster && poster.complete && poster.naturalWidth) {
      const scale=Math.max(SIZE.width/poster.naturalWidth,SIZE.height/poster.naturalHeight)*(options.ambient?1.04:1);
      const w=poster.naturalWidth*scale,h=poster.naturalHeight*scale;
      const drift=options.ambient?options.ambientIntensity/100:0;
      ctx.drawImage(poster,(SIZE.width-w)/2+Math.sin(phase*.21)*12*drift,(SIZE.height-h)/2+Math.sin(phase*.17)*8*drift,w,h);
      ctx.fillStyle='#10142445'; ctx.fillRect(0,0,SIZE.width,SIZE.height);
    }
    if(options.ambient && options.ambientIntensity>0) {
      // Wide, low-frequency light pools: no strobe, no frame-random flicker.
      ctx.save();ctx.globalCompositeOperation='screen';
      const colors=['#7699ff','#da7cf0','#57d9e8'];
      for(let i=0;i<3;i++) {
        const x=SIZE.width*(.18+i*.31)+Math.sin(phase*.35+i*2.2)*110;
        const y=SIZE.height*(.28+(i%2)*.32)+Math.cos(phase*.27+i*1.8)*70;
        const radius=240+35*Math.sin(phase*.3+i);
        const light=ctx.createRadialGradient(x,y,0,x,y,radius);
        light.addColorStop(0,colors[i]);light.addColorStop(1,colors[i]+'00');
        ctx.globalAlpha=options.ambientIntensity/100*(.24+.16*(.5+.5*Math.sin(phase*.9+i*2)));
        ctx.fillStyle=light;ctx.fillRect(0,0,SIZE.width,SIZE.height);
      }
      ctx.restore();
    }
    // Mask is applied after all background effects, before every foreground stroke.
    ctx.fillStyle=`rgba(0,0,0,${options.backgroundDim/100})`;
    ctx.fillRect(0,0,SIZE.width,SIZE.height);
  }
  function render() {
    drawBackground();
    while(baked<strokes.length && mature(strokes[baked])) {
      drawStroke(settledCtx,strokes[baked],clock);
      delete strokes[baked].wetField; baked++;
    }
    foregroundCtx.clearRect(0,0,SIZE.width,SIZE.height);
    foregroundCtx.drawImage(settled,0,0);
    for(let i=baked;i<strokes.length;i++) drawStroke(foregroundCtx,strokes[i],clock);
    if(current) drawStroke(foregroundCtx,current,clock);
    // Screen mixing is confined to ink-on-ink intersections, not the pale poster.
    ctx.drawImage(foreground,0,0);
    present();
  }
  function present() {
    view.clearRect(0,0,canvas.width,canvas.height);
    view.drawImage(frozenImage || artwork,0,0,canvas.width,canvas.height);
  }
  function tick(now) {
    frameId=0;
    if(frozen || document.hidden) { lastFrame=null; return; }
    if(lastFrame!==null) clock+=Math.max(0,now-lastFrame);
    lastFrame=now;
    const blooming=strokes.some(s=>!mature(s));
    const wetPointer=current && WATERCOLOR.enabled && options.bloom && !reducedMotion.matches && clock-current.lastWetBorn<options.duration*1000;
    // Background-only motion is capped at 30fps; live input and ink keep full refresh.
    if(current || blooming || now-lastPaint>=1000/30 || !backgroundMoving()) {render();lastPaint=now;}
    if(blooming || wetPointer || backgroundMoving()) frameId=requestAnimationFrame(tick);
    else lastFrame=null;
  }
  function requestRender() {
    if(!frozen && !frameId && !document.hidden) frameId=requestAnimationFrame(tick);
  }
  function resize() {
    const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,LIMITS.dpr);
    const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
    if(canvas.width!==w || canvas.height!==h) {canvas.width=w; canvas.height=h;}
    present();
  }
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{finish();lastFrame=null;requestRender();});
  reducedMotion.addEventListener('change',()=>{invalidate();requestRender();});
  // Enable export only after the loaded poster has actually reached the canvas.
  poster.onload=()=>{if(!frozen)render();$('makeBtn').disabled=false;};
  poster.onerror=()=>{say('活動底圖載入失敗，仍可繪製與匯出。');$('makeBtn').disabled=false;};
  $('makeBtn').disabled=true;
  poster.src="__POSTER__";

  function updateControls() {
    $('undoBtn').disabled=frozen || !strokes.length;
    $('clearBtn').disabled=frozen || !strokes.length;
    $('settings').disabled=frozen;
    $('freezeBtn').textContent=frozen?'繼續繪製':'凍結畫面';
    $('freezeBtn').setAttribute('aria-pressed',String(frozen));
    $('stateLabel').textContent=frozen?'畫面已凍結':'自由繪製';
    $('canvasTag').textContent=frozen?'FREQUENCY / FROZEN':'DRAW YOUR FREQUENCY';
    $('strokeCount').textContent=`${strokes.length} 道頻率`;
    document.body.classList.toggle('frozen',frozen);
  }
  function setFrozen(value) {
    if(value===frozen) return;
    if(value) {
      finish();
      // Capture the exact displayed logical frame; no final render or time advancement here.
      frozenImage=layer(); frozenImage.getContext('2d').drawImage(artwork,0,0);
      freezeAt=clock; frozen=true; if(frameId) cancelAnimationFrame(frameId); frameId=0;
      say('畫面已凍結。可匯出卡片，或按「繼續繪製」回到創作。');
    } else {
      frozen=false; frozenImage=null; clock=freezeAt; lastFrame=null; requestRender();
      say('已繼續繪製，暈染會從凍結時刻接續。');
    }
    updateControls(); present();
  }
  $('freezeBtn').onclick=()=>setFrozen(!frozen);
  $('undoBtn').onclick=()=>{if(frozen)return;finish();strokes.pop();invalidate();updateControls();requestRender();say('已復原上一道頻率。');};
  $('clearBtn').onclick=()=>{if(frozen)return;finish();strokes=[];invalidate();updateControls();requestRender();say('畫布已清除，選一種顏色重新開始。');};
  document.querySelectorAll('.color-choice').forEach(button=>button.onclick=()=>{
    selected=button.dataset.key;
    document.querySelectorAll('.color-choice').forEach(b=>{const active=b.dataset.key===selected;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('noteText').textContent=COLORS[selected].label;
  });
  function syncInputs() {
    document.querySelectorAll('[data-option]').forEach(input=>{
      const value=options[input.dataset.option];
      if(input.type==='checkbox') input.checked=value;
      else {
        input.value=value;
        input.previousElementSibling.value=input.id==='duration'?`${Number(value).toFixed(1)} 秒`:
          input.id==='ambientSpeed'?`${Number(value).toFixed(1)}×`:
          ['intensity','backgroundDim','ambientIntensity'].includes(input.id)?`${value}%`:String(value);
      }
    });
  }
  document.querySelectorAll('[data-option]').forEach(input=>input.addEventListener('input',()=>{
    if(frozen)return;
    options[input.dataset.option]=input.type==='checkbox'?input.checked:Number(input.value);
    syncInputs();invalidate();requestRender();
  }));
  $('resetBtn').onclick=()=>{if(frozen)return;options={...DEFAULTS};syncInputs();invalidate();requestRender();};

  // Export is generated exclusively from the immutable snapshot, never from the responsive view.
  function makeCard() {
    const out=document.createElement('canvas'); out.width=1080; out.height=1350;
    const c=out.getContext('2d'),h=out.height;
    const bg=c.createLinearGradient(0,0,1080,h);bg.addColorStop(0,'#202032');bg.addColorStop(1,'#11101a');
    c.fillStyle=bg;c.fillRect(0,0,1080,h);
    c.strokeStyle='#ffffff35';c.lineWidth=2;c.strokeRect(48,48,984,h-96);
    const top=80;
    c.fillStyle='#cab8e4';c.font='20px system-ui';c.fillText('44TH NCCU GOLDEN MELODY AWARD',84,top);
    c.fillStyle='#f8f2ff';c.font='600 56px system-ui';c.fillText('曳：靈魂頻率',80,top+68);
    c.fillStyle='#c3b6d6';c.font='18px system-ui';c.fillText('PULL A THREAD. RELEASE A FREQUENCY.',84,top+104);
    // Both the drawing surface and this slot are exactly 4:5. Fit the entire artwork.
    const box={x:150,y:210,w:780,h:975};
    c.drawImage(frozenImage,box.x,box.y,box.w,box.h);
    c.strokeStyle='#ffffff45';c.strokeRect(box.x,box.y,box.w,box.h);
    const base=box.y+box.h;
    c.fillStyle=COLORS[selected].hex;c.beginPath();c.arc(92,1231,7,0,Math.PI*2);c.fill();
    c.fillStyle='#f3eafa';c.font='24px system-ui';c.fillText(COLORS[selected].label,116,1240);
    c.fillStyle='#bcb0cb';c.font='20px system-ui';c.fillText('這是我的聲音，也是我的形狀。',84,1286);
    c.fillStyle='#ddc7ff';c.font='600 20px system-ui';c.textAlign='right';
    c.fillText('第44屆政大金旋獎',996,1286);c.textAlign='left';
    return out;
  }
  async function prepareExport() {
    const generation=++exportGeneration;
    exportFile=null;$('shareBtn').disabled=true;$('downloadLink').removeAttribute('href');
    $('shareStatus').textContent='正在準備圖片…';
    const out=makeCard();
    $('resultImage').src=out.toDataURL('image/png');
    try {
      const blob=await new Promise((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(new Error('無法產生圖片')),'image/png'));
      if(generation!==exportGeneration || !$('exportDialog').open) return;
      if(exportURL) URL.revokeObjectURL(exportURL);
      exportURL=URL.createObjectURL(blob);
      exportFile=new File([blob],'soul-frequency-feed.png',{type:'image/png'});
      $('downloadLink').href=exportURL;$('downloadLink').download=exportFile.name;
      const shareable=!!(navigator.share && navigator.canShare && navigator.canShare({files:[exportFile]}));
      $('shareBtn').disabled=!shareable;
      $('shareStatus').textContent=shareable?'圖片已準備好。可在系統分享中選 Instagram（依手機支援），或儲存後開啟 IG 發布。':'請下載圖片後開啟 IG，新增貼文並選取圖片。手機也可長按預覽圖，儲存至相簿後發布。';
    } catch(error) {
      $('shareStatus').textContent='圖片準備失敗，請關閉後重試。';
    }
  }
  $('makeBtn').onclick=()=>{setFrozen(true);$('exportDialog').showModal();prepareExport();};
  $('closeBtn').onclick=()=>$('exportDialog').close();
  $('exportDialog').addEventListener('close',()=>{
    exportGeneration++;exportFile=null;
    if(exportURL) URL.revokeObjectURL(exportURL);exportURL=null;
    $('downloadLink').removeAttribute('href');$('makeBtn').focus();
  });
  $('exportDialog').addEventListener('click',e=>{if(e.target===$('exportDialog')){
    const r=e.target.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();
  }});
  $('shareBtn').onclick=async()=>{
    if(!exportFile) return;
    try {await navigator.share({files:[exportFile],title:'我的靈魂頻率'});$('shareStatus').textContent='已交給系統分享。是否完成 IG 發布，請在 IG 中確認。';}
    catch(error){$('shareStatus').textContent=error.name==='AbortError'?'已取消分享，仍可下載圖片。':'無法開啟分享，請下載圖片後在 IG 發布。';}
  };
  if(matchMedia('(max-width: 740px)').matches) document.querySelector('details').open=false;
  syncInputs();updateControls();render();resize();
})();
