const DAY=86400000;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const external=(href,label)=>`<a href="${esc(url(href))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
export function deadlineState(d,now=new Date()){
  if(d.at){const delta=Date.parse(d.at)-now.getTime();return delta<=0?'closed':delta<=7*DAY?'urgent':'upcoming';}
  const first=Date.parse(d.date+'T00:00:00+14:00'),last=Date.parse(d.date+'T23:59:59-12:00')+1000;
  return now.getTime()>=last?'closed':now.getTime()>=first?'check':first-now.getTime()<=7*DAY?'urgent':'upcoming';
}
const sortTime=d=>Date.parse(d.at||d.date+'T12:00:00Z');
// The abstract gate remains the primary deadline even while a later PDF gate is open.
export function primaryDeadline(e){return [...e.deadlines].sort((a,b)=>sortTime(a)-sortTime(b))[0]||null;}
export function nextDeadline(e,now=new Date()){const d=primaryDeadline(e);return d&&deadlineState(d,now)!=='closed'?d:null;}
export function isClosed(e,now=new Date()){const d=primaryDeadline(e);return e.submission_mode==='fixed'&&!!d&&deadlineState(d,now)==='closed';}
export function nextEdition(e,now=new Date()){
  if(!isClosed(e,now)||!e.recurrence||e.track!=='regular')return e;
  const r=e.recurrence,[year,month]=r.basis_date.split('-').map(Number);let n=1;
  function elapsed(k){const monthEnd=Date.UTC(year+k,month,1)+12*3600000;const announced=e.announced_next?.cycle===String(r.basis_cycle+k)?e.announced_next.event:null;return monthEnd<=now.getTime()||(announced&&Date.parse(announced.end+'T23:59:59-12:00')<now.getTime());}
  while(elapsed(n))n++;
  const cycle=String(r.basis_cycle+n),a=e.announced_next?.cycle===cycle?e.announced_next:null;
  return {...e,id:e.id.replace(String(r.basis_cycle),cycle),title:e.title.replace(String(r.basis_cycle),cycle),cycle,submission_mode:'estimated',deadlines:[],event:a?.event||null,estimate:{month:`${year+n}-${String(month).padStart(2,'0')}`,basis_date:r.basis_date,basis_url:r.basis_url,basis_cycle:r.basis_cycle}};
}
export function visibleEntries(entries,page,now=new Date()){
  return entries.filter(e=>page==='conferences'?e.kind==='conference':e.kind!=='conference').map(e=>nextEdition(e,now)).filter(e=>!(['postdeadline','special'].includes(e.track)&&isClosed(e,now)));
}
const dateText=d=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const monthText=m=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-15T12:00:00Z'));
const dateRange=e=>`${dateText(e.start)} – ${dateText(e.end)}`;
const exactText=(d,zone)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:zone,timeZoneName:'short'}).format(new Date(d.at));
const icsEscape=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function fold(line){let result='',part='';for(const c of line){if(new TextEncoder().encode(part+c).length>75){result+=part+'\r\n';part=' ';}part+=c;}return result+part;}
export function calendarText(entries,now=new Date(),includeClosed=false){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Yuyang Wang//Submission Calendar//EN','CALSCALE:GREGORIAN'];
 for(const e of entries){
  const primary=primaryDeadline(e);
  for(const d of e.deadlines){
   if(!includeClosed&&(isClosed(e,now)||deadlineState(d,now)==='closed'))continue;
   const desc=`${d.label}. ${d===primary?'Earliest required submission gate.':'Later stage: earlier abstract/registration gate is required.'} ${d.at?'Official timezone: '+d.timezone+'.':'Date-only reminder; official cutoff time and timezone unconfirmed.'} ${e.note||''}\nSource: ${d.source}\nVerified: ${e.verified_on}`;
   lines.push('BEGIN:VEVENT',`UID:${e.id}-${d.date}-${e.deadlines.indexOf(d)}@wangyy.phd`,`DTSTAMP:${stamp(now)}`);
   if(d.at)lines.push(`DTSTART:${stamp(new Date(d.at))}`,`DTEND:${stamp(new Date(Date.parse(d.at)+60000))}`);
   else{const end=new Date(d.date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push(`DTSTART;VALUE=DATE:${d.date.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,'')}`);}
   lines.push(`SUMMARY:${icsEscape(e.title+' — '+d.label)}`,`DESCRIPTION:${icsEscape(desc)}`,`URL:${d.source}`,'TRANSP:TRANSPARENT','END:VEVENT');
  }
  if(e.event&&(includeClosed||Date.parse(e.event.end+'T23:59:59-12:00')>=now.getTime())){
   const end=new Date(e.event.end+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
   const uid=`UID:meeting-${e.short_name.toLowerCase().replace(/[^a-z0-9]/g,'')}-${e.event.start}@wangyy.phd`;
   if(!lines.includes(uid))lines.push('BEGIN:VEVENT',uid,`DTSTAMP:${stamp(now)}`,`DTSTART;VALUE=DATE:${e.event.start.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,'')}`,`SUMMARY:${icsEscape(e.title.split(' · ')[0])}`,`LOCATION:${icsEscape(e.event.venue+', '+e.event.city)}`,`URL:${e.event.source}`,'TRANSP:TRANSPARENT','END:VEVENT');
  }
 }
 return lines.concat('END:VCALENDAR').map(fold).join('\r\n')+'\r\n';
}
function download(entries){const href=URL.createObjectURL(new Blob([calendarText(entries)],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=href;a.download='submission-calendar.ics';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),3000);}
function paperList(papers){return `<ul class="paper-list">${papers.map(p=>`<li>${external(p.url,p.title)} <span class="meta">(${p.year})</span></li>`).join('')}</ul>`;}
function card(e,now){
 const d=primaryDeadline(e),state=d?deadlineState(d,now):'estimated';
 const heading=e.kind==='special-issue'?e.short_name+' · '+e.title:e.title;
 const status=e.estimate?'Estimated · next regular cycle':e.track==='postdeadline'?'Post-deadline · Student eligible':state==='urgent'?'Due within 7 days':state==='check'?'Check exact cutoff':'Official date';
 const rows=e.deadlines.map(x=>`<div class="date-line ${x===d?'primary':''}"><b>${esc(x.label)}${x===d?' · earliest required gate':''}</b>${external(x.source,x.at?exactText(x,x.timezone):dateText(x.date))}<small>${x.at?esc(x.timezone):'Exact time / timezone not stated'}</small>${x.at?`<small>Your time: ${esc(exactText(x,Intl.DateTimeFormat().resolvedOptions().timeZone))}</small>`:''}</div>`).join('');
 return `<details class="opportunity" id="${esc(e.id)}"><summary><div class="venue"><h3>${esc(heading)}</h3><p class="meta">${esc(e.fit)}</p></div><div class="deadline"><span class="deadline-date ${e.estimate?'forecast':''}">${e.estimate?esc(monthText(e.estimate.month)):d?esc(dateText(d.date)):'Not announced'}</span><span class="state ${state}">${esc(status)}</span><span class="meta">${esc(d?.label||'Based on previous CFP')}</span></div><div class="meeting">${e.event?`${esc(dateRange(e.event))}<br>${esc(e.event.city)}`:e.kind==='special-issue'?`Issue: ${esc(e.cycle)}`:'Next meeting details not announced'}${e.event&&e.estimate?'<span class="state">Meeting confirmed; deadline estimated</span>':''}</div><span class="toggle" aria-hidden="true">+</span></summary><div class="detail"><div class="detail-grid"><div><h4>Submission dates</h4>${e.estimate?`<p class="meta">Forecast: ${esc(monthText(e.estimate.month))}<br>Basis: ${external(e.estimate.basis_url,e.estimate.basis_cycle+' CFP / official announcement')}<br>Previous earliest gate: ${esc(dateText(e.estimate.basis_date))}<br>No exact next-cycle deadline is inferred.</p>`:rows}${e.event?`<h4>Meeting</h4><p class="meta">${esc(dateRange(e.event))}<br>${esc(e.event.venue)}<br>${esc(e.event.city)} · ${external(e.event.source,'Source')}</p>`:''}</div><div><h4>${e.estimate?'Previous-cycle format · recheck next CFP':'Format requirements'}</h4><ul class="format-list">${e.format.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${external(e.format_source,'Author instructions')}${e.eligibility?`<h4 style="margin-top:15px">Student eligibility</h4><p class="meta">${esc(e.eligibility.basis)} ${external(e.eligibility.source,'Eligibility basis')}</p>`:''}</div></div>${e.note?`<p class="note">${esc(e.note)}</p>`:''}<div class="links">${e.links.map(l=>external(l.url,l.label)).join('')}</div><div class="detail-bottom"><span>Verified ${esc(e.verified_on)} · ${external(e.website,'Official site')}</span>${e.deadlines.length||e.event?`<button data-calendar="${esc(e.id)}">Export dates (.ics)</button>`:''}</div></div></details>`;
}
function deadlineSort(a,b){const time=e=>primaryDeadline(e)?sortTime(primaryDeadline(e)):e.estimate?Date.parse(e.estimate.month+'-01T00:00:00Z'):Infinity;return time(a)-time(b)||a.title.localeCompare(b.title);}
function section(id,title,entries,now,note){return `<section id="${id}"><h2>${esc(title)} <small>${entries.length}</small></h2>${note?`<p class="section-note">${esc(note)}</p>`:''}${entries.length?`<div class="column-head"><span>${id==='special'?'Journal / special issue':'Conference / call'} & relevance</span><span>Earliest deadline</span><span>${id==='special'?'Publication issue':'Meeting'}</span><span></span></div>`+[...entries].sort(deadlineSort).map(e=>card(e,now)).join(''):'<p class="empty">No matching active calls.</p>'}</section>`;}
export function groupJournals(entries){
 const groups={core:[],letters:[],devices:[],reach:[],specialist:[]};
 for(const e of entries)if(e.kind==='journal')(groups[e.target_group]||groups.specialist).push(e);
 return groups;
}
function journalRow(e,papers){
 const examples=papers.filter(p=>e.paper_ids.includes(p.id));
 const name=e.short_name!==e.title?e.short_name+' · '+e.title:e.title;
 return `<div class="journal-row" id="${esc(e.id)}"><div><a class="journal-name" href="${esc(url(e.website))}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>${e.article_format?`<p class="article-format">${external(e.article_format.source,e.article_format.label)}</p>`:'<p class="meta">Rolling submissions</p>'}</div><div>${esc(e.fit)}${examples.length?`<details><summary>Recent papers (${examples.length})</summary>${paperList(examples)}</details>`:''}${e.format.length?`<details><summary>Format requirements</summary><ul class="format-list">${e.format.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></details>`:''}</div><div>${external(e.format_source,'Author information')}<p>${external(e.website,'Latest articles')}</p></div></div>`;
}
function journalTable(entries,papers){return entries.length?'<div class="journal-head"><span>Journal / article type</span><span>Suitable work / papers</span><span>Submission / articles</span></div>'+entries.map(e=>journalRow(e,papers)).join(''):'<p class="empty">No matching journals.</p>';}
function journalDirectory(entries,papers,calls,now,expanded){
 const g=groupJournals(entries),mainLetters=g.letters.filter(e=>['optics-letters','ptl','applied-physics-letters'].includes(e.id)),otherLetters=g.letters.filter(e=>!['optics-letters','ptl','applied-physics-letters'].includes(e.id));
 const fold=(id,title,rows,content)=>rows.length?`<details class="target-fold" id="${id}"${expanded?' open':''}><summary><h2>${title} <small>${rows.length}</small></h2><span aria-hidden="true">+</span></summary>${content}</details>`:'';
 const topics={quantum:'Quantum photonics',materials:'Materials & nanodevices',electronics:'ICs & design automation',applied:'Optical physics, fiber & applied studies'};
 const specialist=Object.entries(topics).map(([id,title])=>{const rows=g.specialist.filter(e=>e.target_topic===id);return rows.length?`<section class="topic-group" id="topic-${id}"><h3>${title} <span class="meta">${rows.length}</span></h3>${journalTable(rows,papers)}</section>`:'';}).join('');
 return `<div id="journal-directory"><section id="core-journals"><h2>Core photonics <small>${g.core.length}</small></h2>${journalTable(g.core,papers)}</section><section id="letter-journals"><h2>Letters & short papers <small>${g.letters.length}</small></h2>${journalTable(mainLetters,papers)}${entries.some(e=>e.id==='optica')?'<p class="format-route">Also: <a href="#optica">Optica · 4-page Letters</a></p>':''}${fold('other-letters','Physics / nanomaterials letters',otherLetters,journalTable(otherLetters,papers))}</section><section id="device-journals"><h2>Devices & platforms <small>${g.devices.length}</small></h2>${journalTable(g.devices,papers)}</section>${section('special','Special-issue deadlines',calls,now,'')}${fold('reach-journals','Reach targets',g.reach,journalTable(g.reach,papers))}${fold('specialist-journals','Other journals by topic',g.specialist,specialist)}</div>`;
}
function meetingPlan(raw,query){const now=new Date(),rows=raw.filter(e=>e.kind==='conference'&&e.track==='regular'&&e.category==='core').flatMap(e=>[e.event?{...e.event,name:e.short_name,cycle:e.cycle}:null,e.announced_next?{...e.announced_next.event,name:e.short_name,cycle:e.announced_next.cycle}:null]).filter(Boolean).filter(e=>Date.parse(e.end+'T23:59:59-12:00')>=now.getTime()).filter(e=>!query||[e.name,e.city,e.venue].join(' ').toLowerCase().includes(query)).sort((a,b)=>a.start.localeCompare(b.start));return `<h2>Announced core-conference meetings</h2><div class="table-wrap"><table><thead><tr><th>Conference</th><th>Dates</th><th>Location / venue</th><th>Source</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${esc(e.name+' '+e.cycle)}</td><td>${esc(dateRange(e))}</td><td>${esc(e.city)}<br><span class="meta">${esc(e.venue)}</span></td><td>${external(e.source,'Official')}</td></tr>`).join('')}</tbody></table></div>`;}
async function start(){
 const results=document.querySelector('#results'),page=document.body.dataset.page;
 try{
  const response=await fetch(document.body.dataset.base+'data.json',{cache:'no-cache'});if(!response.ok)throw new Error('data');const data=await response.json();
  document.querySelector('#updated').textContent='Checked '+data.updated_on;
  const search=document.querySelector('#search'),area=document.querySelector('#area'),exp=document.querySelector('#export');let entries=[],shown=[];
  const recent=data.papers.filter(p=>p.year>=new Date().getFullYear()-1);
  function render(){const now=new Date(),q=search.value.trim().toLowerCase(),open=new Set([...results.querySelectorAll('details[open]')].filter(e=>e.id).map(e=>e.id));entries=visibleEntries(data.entries,page,now);
   const matches=e=>(area.value==='all'||e.topics.includes(area.value))&&(!q||[e.title,e.short_name,e.fit,e.note,e.event?.city,e.event?.venue,...e.format,e.article_format?.label,...recent.filter(p=>e.paper_ids.includes(p.id)).map(p=>p.title+' '+p.topic)].join(' ').toLowerCase().includes(q));shown=entries.filter(matches);
   if(page==='conferences'){
    results.innerHTML=section('core','Core conferences · regular submissions',shown.filter(e=>e.category==='core'&&e.track==='regular'),now,'')+section('postdeadline','Post-deadline · Student eligible',shown.filter(e=>e.track==='postdeadline'),now,'')+section('adjacent','Design automation / adjacent conferences',shown.filter(e=>e.category==='adjacent'&&e.track==='regular'),now,'');
    document.querySelector('#meeting-plan').innerHTML=meetingPlan(data.entries.filter(e=>area.value==='all'||e.topics.includes(area.value)),q);
   }else{
    results.innerHTML=journalDirectory(shown.filter(e=>e.kind==='journal'),recent,shown.filter(e=>e.kind==='special-issue'),now,!!q||area.value!=='all');
    const specialLink=document.querySelector('#special-count');if(specialLink)specialLink.textContent=String(shown.filter(e=>e.kind==='special-issue').length);
    const matchedJournals=new Set(shown.filter(e=>e.kind==='journal').map(e=>e.id));const papers=recent.filter(p=>matchedJournals.has(p.journal_id)&&(!q||[p.title,p.topic,data.entries.find(e=>e.id===p.journal_id)?.title].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.year-a.year||(b.published_on||'').localeCompare(a.published_on||'')||a.title.localeCompare(b.title));
    document.querySelector('#recent-papers').innerHTML=`<h2>Recent integrated-photonics papers <small>${papers.length}</small></h2>${papers.map(p=>`<article class="paper-row"><h3>${external(p.url,p.title)}</h3><p>${esc(data.entries.find(e=>e.id===p.journal_id)?.title)} · ${esc(p.published_on||p.year)}</p><p>${esc(p.topic)}</p></article>`).join('')||'<p class="empty">No matching recent papers.</p>'}`;
   }
   for(const id of open){const el=document.getElementById(id);if(el)el.open=true;}
   document.querySelector('#result-count').textContent=`${shown.length} ${page==='conferences'?'submission rounds':'journals / calls'}`;exp.disabled=!shown.some(e=>nextDeadline(e,now)||e.event);
  }
  search.addEventListener('input',render);area.addEventListener('change',render);results.addEventListener('click',e=>{const b=e.target.closest('[data-calendar]');if(b)download(entries.filter(x=>x.id===b.dataset.calendar));});exp.addEventListener('click',()=>download(shown));render();setInterval(render,60000);
  function revealAnchor(){const linked=document.getElementById(location.hash.slice(1));if(!linked)return;let node=linked;while(node){if(node.tagName==='DETAILS')node.open=true;node=node.parentElement;}linked.scrollIntoView();}window.addEventListener('hashchange',revealAnchor);revealAnchor();
 }catch(error){results.innerHTML=`<p class="empty">Unable to load records. Reload this page or <a href="${esc(document.body.dataset.base)}data.json">open the data</a>.</p>`;}
}
if(typeof document!=='undefined')start();
