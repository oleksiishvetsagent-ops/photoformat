'use strict';
const $ = id => document.getElementById(id);
let items = [], busy = false, serial = 0;
const size = n => n < 1048576 ? `${Math.round(n / 1024)} КБ` : `${(n / 1048576).toFixed(1)} МБ`;
function status(text) { $('status').textContent = text; }
function controls() {
  $('convert').disabled = busy || !items.length; $('clear').disabled = busy || !items.length;
  $('zip').disabled = busy || !items.some(x => x.result); $('settings').disabled = busy;
  $('files').disabled = busy; $('drop').setAttribute('aria-disabled', String(busy));
}
function render() {
  const queue = $('queue'); queue.replaceChildren();
  if (!items.length) queue.innerHTML = '<div class="empty"><span>▧</span><p>Тут з’являться ваші фотографії</p><small>Додайте першу партію, щоб почати</small></div>';
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'row';
    const img = document.createElement('img'); img.className = 'thumb'; img.alt = ''; img.src = item.preview; row.append(img);
    const info = document.createElement('div'); info.className = 'file-info';
    const name = document.createElement('div'); name.className = 'file-name'; name.textContent = item.file.name; name.title = item.file.name;
    const detail = document.createElement('div'); detail.className = 'file-detail' + (item.error ? ' error' : item.result ? ' success' : '');
    detail.textContent = item.error || (item.result ? `✓ ${item.w} × ${item.h} · JPG · ${size(item.result.size)}` : `${size(item.file.size)} · очікує обробки`);
    info.append(name, detail); row.append(info);
    if (item.result) { const download = document.createElement('button'); download.textContent = '↓'; download.title = 'Завантажити JPG'; download.setAttribute('aria-label', `Завантажити ${item.name}`); download.onclick = () => save(item.result, item.name); row.append(download); }
    const remove = document.createElement('button'); remove.textContent = '×'; remove.disabled = busy; remove.setAttribute('aria-label', `Видалити ${item.file.name}`); remove.onclick = () => { URL.revokeObjectURL(item.preview); items = items.filter(x => x !== item); render(); }; row.append(remove); queue.append(row);
  }
  $('count').textContent = `Фотографій: ${items.length}`;
  $('total').textContent = items.length ? `${size(items.reduce((s,x) => s+x.file.size,0))} · готово ${items.filter(x=>x.result).length}` : 'Готові до нової партії'; controls();
}
function add(files) {
  if (busy) return;
  for (const file of files) {
    items.push({id:++serial, file, preview:URL.createObjectURL(file)});
  }
  $('files').value = ''; render(); status('Натисніть «Обробити фотографії». Формати, які браузер не прочитає, отримають окреме повідомлення.');
}
$('files').onchange = e => add(e.target.files);
$('drop').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); $('files').click(); } };
for (const event of ['dragenter','dragover']) $('drop').addEventListener(event,e=>{e.preventDefault(); if(!busy) $('drop').classList.add('drag');});
for (const event of ['dragleave','drop']) $('drop').addEventListener(event,e=>{e.preventDefault(); $('drop').classList.remove('drag');});
$('drop').addEventListener('drop',e=>add(e.dataTransfer.files));
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());
$('clear').onclick = () => { items.forEach(x=>URL.revokeObjectURL(x.preview)); items=[]; $('progress').hidden=true; render(); status('Спочатку додайте фотографії'); };
function invalidate() { for(const x of items){x.result=null;x.error=null;} $('progress').hidden=true; render(); status(items.length?'Налаштування змінено. Обробіть фото знову.':'Спочатку додайте фотографії'); }
$('settings').addEventListener('input', invalidate);
function syncMode() {
  const mode=$('mode').value, automatic=mode==='minimum';
  $('dimensions').hidden=automatic; $('upscale-control').hidden=automatic;
  $('upscale').disabled=mode==='cover';
  $('mode-help').textContent={minimum:'Коротша сторона менша за 1200 px — збільшуємо пропорційно. Від 1200 px — розміри без змін.',fit:'Фото поміститься в задані межі. Одна зі сторін може бути меншою.',cover:'Фото заповнить весь розмір. Краї будуть обрізані по центру.',contain:'Фото залишиться цілим. Вільне місце заповниться вибраним кольором.'}[mode];
}
$('preset').onchange = () => {
  const preset=$('preset').value;
  if(preset==='auto') $('mode').value='minimum';
  else { if($('mode').value==='minimum') $('mode').value='fit'; if(preset!=='custom'){const [w,h]=preset.split(',');$('width').value=w;$('height').value=h;} }
  syncMode(); invalidate();
};
for(const id of ['width','height']) $(id).addEventListener('input',()=>{$('preset').value='custom';});
$('quality').addEventListener('input',()=>{$('quality-value').value=`${$('quality').value}%`;});
$('mode').onchange=()=>{if($('mode').value==='minimum')$('preset').value='auto';else if($('preset').value==='auto')$('preset').value='custom';syncMode();invalidate();};
function outputGeometry(iw,ih,w,h,mode,upscale) {
  let scale=mode==='minimum'?Math.max(1,1200/Math.min(iw,ih)):mode==='cover'?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih);
  if(mode!=='minimum'&&mode!=='cover'&&!upscale)scale=Math.min(1,scale);
  const proportional=mode==='minimum'||mode==='fit';
  const width=proportional?Math.max(1,Math.round(iw*scale)):w,height=proportional?Math.max(1,Math.round(ih*scale)):h;
  return {width,height,dw:proportional?width:iw*scale,dh:proportional?height:ih*scale};
}
async function decode(file) {
  if ('createImageBitmap' in window) { try { return await createImageBitmap(file); } catch {} }
  return new Promise((resolve,reject)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Формат не підтримується браузером або файл пошкоджений'));};img.src=url;});
}
$('convert').onclick = async () => {
  const w=Number($('width').value),h=Number($('height').value);
  if($('mode').value!=='minimum'&&(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>8192||h>8192||w*h>32000000)){status('Введіть цілі розміри від 1 до 8192 px, разом не більше 32 мегапікселів.');return;}
  const mode=$('mode').value,quality=Number($('quality').value)/100,bg=$('background').value,upscale=$('upscale').checked;
  busy=true;items.forEach(x=>{x.result=null;x.error=null;});render();$('progress').hidden=false;$('progress').max=items.length;$('progress').value=0;
  for(let i=0;i<items.length;i++){
    const item=items[i];let img,canvas;status(`Обробка ${i+1} із ${items.length}: ${item.file.name}`);
    try{
      img=await decode(item.file);const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
      if(!iw||!ih)throw new Error('Не вдалося прочитати розмір фото');
      const geometry=outputGeometry(iw,ih,w,h,mode,upscale);
      if(geometry.width>32767||geometry.height>32767||geometry.width*geometry.height>100000000)throw new Error('Фото завелике для браузера. Розміри не змінено; спробуйте ручний режим.');
      canvas=document.createElement('canvas');canvas.width=geometry.width;canvas.height=geometry.height;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Недостатньо пам’яті для обробки');
      ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      const {dw,dh}=geometry;
      ctx.drawImage(img,(canvas.width-dw)/2,(canvas.height-dh)/2,dw,dh);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob||blob.type!=='image/jpeg')throw new Error('Не вдалося створити JPG');
      item.result=blob;item.w=canvas.width;item.h=canvas.height;item.name=`${String(i+1).padStart(3,'0')}_${item.file.name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,100)}.jpg`;
    }catch(error){item.error=error.message||'Не вдалося обробити фото';}
    finally{if(img?.close)img.close();if(canvas){canvas.width=1;canvas.height=1;}}
    $('progress').value=i+1;render();await new Promise(resolve=>setTimeout(resolve,0));
  }
  busy=false;render();const done=items.filter(x=>x.result).length;status(`Готово: ${done} із ${items.length}. ${done<items.length?'Деякі файли не вдалося обробити.':'Завантажте JPG окремо або всі одним архівом.'}`);
};
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
// ZIP store format: JPEG is already compressed. UTF-8 filenames, CRC32 and central directory.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function header(length){const bytes=new Uint8Array(length);return {bytes,view:new DataView(bytes.buffer)};}
async function makeZip(entries){
  if(entries.length>65535)throw new Error('Забагато файлів для одного ZIP');
  let offset=0;const chunks=[],central=[];const encoder=new TextEncoder();
  for(const item of entries){
    const bytes=new Uint8Array(await item.result.arrayBuffer()),name=encoder.encode(item.name),crc=crc32(bytes);
    if(offset+bytes.length+name.length+30>0xffffffff)throw new Error('Архів перевищує 4 ГБ. Завантажте меншу партію.');
    const local=header(30),v=local.view;v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);chunks.push(local.bytes,name,item.result);
    const c=header(46),cv=c.view;cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.push(c.bytes,name);offset+=30+name.length+bytes.length;
  }
  const centralLength=central.reduce((n,c)=>n+c.length,0);if(offset+centralLength>0xffffffff)throw new Error('Архів завеликий. Зменште партію.');
  const end=header(22),e=end.view;e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralLength,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end.bytes],{type:'application/zip'});
}
$('zip').onclick=async()=>{busy=true;controls();status('Готуємо ZIP-архів…');try{const zip=await makeZip(items.filter(x=>x.result));save(zip,'photoformat-jpg.zip');status('Архів готовий. Завантаження розпочато.');}catch(e){status(e.message||'Не вдалося створити архів. Спробуйте меншу партію.');}finally{busy=false;controls();}};
