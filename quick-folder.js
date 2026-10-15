'use strict';
let folderHandle=null, folderEntries=[], folderRunning=false, folderStop=false, folderFinished=false;
const folderImagePattern=/\.(jpe?g|jfif|jif|jfi|png|webp|avif|gif|bmp|svg|heic|heif|tiff?|ico)$/i;
function folderMessage(text){$('folder-status').textContent=text;}
function folderUpdate(){
  const count=folderEntries.filter(x=>x.selected).length;
  $('folder-count').textContent=`Вибрано: ${count} із ${folderEntries.length}`;
  $('folder-run').disabled=folderRunning||folderFinished||!count;
  $('folder-run').textContent=folderRunning?'Обробляємо та замінюємо…':`Обробити й замінити ${count} фото`;
  $('folder-all').disabled=$('folder-none').disabled=folderRunning||folderFinished;
  $('folder-close').disabled=folderRunning;
  for(const entry of folderEntries)entry.checkbox.disabled=folderRunning||folderFinished;
}
function outputFileName(name){return /\.jpg$/i.test(name)?name:name.replace(/\.[^.]+$/,'')+'.jpg';}
async function getExistingFile(dir,name){try{return await dir.getFileHandle(name);}catch(e){if(e.name==='NotFoundError')return null;throw e;}}
async function writeVerified(handle,blob){
  let writer;
  try{writer=await handle.createWritable();await writer.write(blob);await writer.close();writer=null;}
  catch(e){if(writer){try{await writer.abort();}catch{}}throw e;}
  const stored=await handle.getFile();
  if(stored.size!==blob.size)throw Error('Не вдалося перевірити записаний файл. Оригінал збережено в резервній папці.');
}
function sameVersion(a,b){return a.size===b.size&&a.lastModified===b.lastModified;}
async function replaceFolderPhoto(dir,backupDir,entry,settings,encode=encodePhoto){
  const source=await entry.handle.getFile();
  if(!sameVersion(source,entry.snapshot))throw Error('Файл змінився після вибору. Виберіть його знову.');
  const result=await encode(source,settings);
  // Never overwrite an unrelated JPG with the same base name.
  const targetName=outputFileName(entry.name);
  const existing=await getExistingFile(dir,targetName);
  const sameTarget=existing?await existing.isSameEntry(entry.handle):false;
  if(existing&&!sameTarget)throw Error(`У папці вже є ${targetName}. Його не перезаписано.`);
  if(!sameVersion(source,await entry.handle.getFile()))throw Error('Оригінал змінився під час обробки. Пропущено.');
  const backup=await backupDir.getFileHandle(entry.name,{create:true});
  await writeVerified(backup,source);
  const target=existing||await dir.getFileHandle(targetName,{create:true});
  await writeVerified(target,result.blob);
  if(!sameTarget){
    if(!sameVersion(source,await entry.handle.getFile()))return {name:targetName,width:result.width,height:result.height,warning:'JPG готовий, але оригінал змінився — залишено обидва файли.'};
    try{await dir.removeEntry(entry.name);}
    catch{return {name:targetName,width:result.width,height:result.height,warning:'JPG готовий, але браузер не дозволив прибрати оригінал. Залишено обидва файли.'};}
  }
  return {name:targetName,width:result.width,height:result.height};
}
$('quick-folder').onclick=async()=>{
  if(busy)return;
  if(!('showDirectoryPicker' in window)){status('Заміна файлів у папці недоступна в цьому браузері. Відкрийте сайт у Chrome або Edge на комп’ютері.');return;}
  try{
    // Must be called directly from the click, before asynchronous work.
    const picker=window.showDirectoryPicker({mode:'readwrite',id:'photoformat-folder'});
    busy=true;controls();folderHandle=await picker;
    folderEntries=[];folderFinished=false;folderStop=false;
    $('folder-list').replaceChildren();$('folder-progress').hidden=true;
    $('folder-name').textContent=`Папка: ${folderHandle.name}`;
    const settings=readSettings();
    $('folder-settings').textContent=`Поточні налаштування: ${settings.mode==='minimum'?'коротша сторона від 1200 px':settings.w+' × '+settings.h+' px'}, JPG ${Math.round(settings.quality*100)}%, яскравість ${settings.brightness}, контраст ${settings.contrast}, захист ${Math.round(settings.protectHighlights*100)}%.`;
    folderMessage('Читаємо фотографії з папки…');$('folder-dialog').showModal();folderUpdate();
    const handles=[];
    for await(const handle of folderHandle.values())if(handle.kind==='file'&&folderImagePattern.test(handle.name))handles.push(handle);
    handles.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    for(const handle of handles){
      const entry={name:handle.name,handle,selected:true};
      const row=document.createElement('label');row.className='folder-row';
      const check=document.createElement('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label',`Обробити ${entry.name}`);
      const span=document.createElement('span');span.textContent=entry.name;
      const detail=document.createElement('small');
      try{entry.snapshot=await handle.getFile();detail.textContent=`${size(entry.snapshot.size)} → ${outputFileName(entry.name)}`;}catch(e){entry.selected=false;check.checked=false;detail.textContent='Файл недоступний';}
      span.append(detail);row.append(check,span);$('folder-list').append(row);entry.checkbox=check;entry.detail=detail;folderEntries.push(entry);
      check.onchange=()=>{entry.selected=check.checked;folderUpdate();};
    }
    folderMessage(folderEntries.length?'Відмітьте потрібні фото. Дозвіл на запис діє для всієї вибраної папки.':'У цій папці немає підтримуваних зображень. Закрийте вікно та виберіть іншу папку.');
  }catch(e){if(e.name!=='AbortError')status(`Не вдалося відкрити папку: ${e.message}`);}
  finally{busy=false;controls();folderUpdate();}
};
$('folder-all').onclick=()=>{for(const x of folderEntries){x.selected=!!x.snapshot;x.checkbox.checked=x.selected;}folderUpdate();};
$('folder-none').onclick=()=>{for(const x of folderEntries){x.selected=false;x.checkbox.checked=false;}folderUpdate();};
$('folder-close').onclick=()=>{if(!folderRunning)$('folder-dialog').close();};
$('folder-dialog').addEventListener('cancel',e=>{if(folderRunning)e.preventDefault();});
$('folder-stop').onclick=()=>{folderStop=true;$('folder-stop').disabled=true;folderMessage('Зупиняємо після безпечного завершення поточного фото…');};
$('folder-run').onclick=async()=>{
  if(folderRunning||folderFinished||busy||!folderHandle)return;
  const selected=folderEntries.filter(x=>x.selected&&x.snapshot);if(!selected.length)return;
  let settings;try{settings=readSettings();}catch(e){folderMessage(e.message);return;}
  // Request at most once for the whole folder; never once per image.
  const permission=folderHandle.requestPermission({mode:'readwrite'});
  folderRunning=true;busy=true;folderStop=false;controls();folderUpdate();
  $('folder-stop').hidden=false;$('folder-stop').disabled=false;
  $('folder-progress').hidden=false;$('folder-progress').max=selected.length;$('folder-progress').value=0;
  let completed=0,failed=0,warnings=0,processed=0,backupPath='';
  try{
    if(await permission!=='granted')throw Error('Дозвіл на запис у папку не надано. Жодне фото не змінено.');
    const root=await folderHandle.getDirectoryHandle('_photoformat_originals',{create:true});
    const runName=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8);
    const backup=await root.getDirectoryHandle(runName,{create:true});backupPath=`_photoformat_originals/${runName}`;
    // Colliding source names must not compete for the same destination.
    const destinations=new Map();
    for(const entry of selected){const key=outputFileName(entry.name).toLocaleLowerCase();destinations.set(key,(destinations.get(key)||0)+1);}
    for(const entry of selected){
      if(folderStop)break;
      folderMessage(`Обробка ${processed+1} із ${selected.length}: ${entry.name}`);
      try{
        if(destinations.get(outputFileName(entry.name).toLocaleLowerCase())>1)throw Error('Кілька вибраних фото мають однакову назву JPG. Виберіть лише одне з них.');
        const result=await replaceFolderPhoto(folderHandle,backup,entry,settings);
        completed++;if(result.warning)warnings++;
        entry.detail.textContent=`✓ ${result.name} · ${result.width} × ${result.height}${result.warning?' · '+result.warning:''}`;
      }catch(e){failed++;entry.detail.textContent=`Не замінено: ${e.message}`;}
      processed++;$('folder-progress').value=processed;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    folderFinished=true;
    folderMessage(`${folderStop?'Зупинено. ':''}Готово: ${completed}. Помилок: ${failed}.${warnings?' Зі збереженим оригіналом поруч: '+warnings+'.':''}${processed<selected.length?' Не оброблено: '+(selected.length-processed)+'.':''} Резервні оригінали: ${backupPath}.`);
    status(`Обробка в папці «${folderHandle.name}»: готово ${completed}, помилок ${failed}.`);
  }catch(e){folderMessage(e.message||'Не вдалося записати файли.');}
  finally{folderRunning=false;busy=false;controls();folderUpdate();$('folder-stop').hidden=true;}
};
window.addEventListener('beforeunload',e=>{if(folderRunning){e.preventDefault();e.returnValue='';}});
if(!('showDirectoryPicker' in window))$('quick-help').textContent='Для заміни файлів відкрийте сайт у Chrome або Edge на комп’ютері.';
