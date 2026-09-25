const DAY = 86400000;
const TYPE = {conference: 'Conference', 'special-issue': 'Special issue', journal: 'Journal'};
const AREA = {photonics:'Photonics', 'optical-communications':'Optical communications', 'integrated-circuits':'Integrated circuits', quantum:'Quantum'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url = value => {try {const u = new URL(value);return u.protocol === 'https:' ? u.href : '#';} catch {return '#';}};
export function deadlineState(d, now = new Date()) {
  if (d.at) {const delta = Date.parse(d.at) - now.getTime(); return delta <= 0 ? 'closed' : delta <= 7 * DAY ? 'urgent' : 'upcoming';}
  // Unknown cutoff stays uncertain across the complete UTC+14 to UTC-12 date span.
  const earliest = Date.parse(d.date + 'T00:00:00+14:00');
  const latest = Date.parse(d.date + 'T23:59:59-12:00') + 1000;
  if (now.getTime() >= latest) return 'closed';
  if (now.getTime() >= earliest) return 'check';
  return earliest - now.getTime() <= 7 * DAY ? 'urgent' : 'upcoming';
}
const sortTime = d => Date.parse(d.at || d.date + 'T12:00:00Z');
export function nextDeadline(e, now = new Date()) {return [...e.deadlines].filter(d => deadlineState(d, now) !== 'closed').sort((a,b)=>sortTime(a)-sortTime(b))[0] || null;}
export function isClosed(e, now = new Date()) {return e.submission_mode === 'fixed' && e.deadlines.length > 0 && !nextDeadline(e, now);}
export function nextEdition(e, now = new Date()) {
  if (!isClosed(e, now) || !e.recurrence) return e;
  const r=e.recurrence, [year,month]=r.basis_date.split('-').map(Number);
  let n=1;
  // Keep a month-level forecast until that complete month has passed worldwide.
  function monthEnd(k) {const next=new Date(Date.UTC(year+k,month,1));return next.getTime()+12*3600000;}
  while(monthEnd(n)<=now.getTime())n++;
  const cycle=String(r.basis_cycle+n), expected=`${year+n}-${String(month).padStart(2,'0')}`;
  return {...e, id:e.id.replace(String(r.basis_cycle),cycle), title:e.title.replace(String(r.basis_cycle),cycle), cycle, submission_mode:'estimated', deadlines:[], event:null,
    estimate:{month:expected,basis_date:r.basis_date,basis_url:r.basis_url,basis_cycle:r.basis_cycle},
    note:`Estimated submission month based on the ${r.basis_cycle} regular CFP (${r.basis_date}). The next official deadline and meeting details have not been verified. Format guidance below is from the previous cycle; recheck when the new CFP appears.`};
}
const monthText=m=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-15T12:00:00Z'));
const dateText = d => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
function exactText(d, zone) {return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:zone,timeZoneName:'short'}).format(new Date(d.at));}
const dateRange = e => e ? `${dateText(e.start)} – ${dateText(e.end)}` : '';
const icsEscape = s => String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function fold(line) {let result='',part='';for(const c of line){if(new TextEncoder().encode(part+c).length>75){result+=part+'\r\n';part=' ';}part+=c;}return result+part;}
export function calendarText(entries, now = new Date(), includeClosed = false) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Yuyang Wang//Submission Calendar//EN','CALSCALE:GREGORIAN'];
  for(const e of entries){
    for(const d of e.deadlines){
      if(!includeClosed && deadlineState(d,now)==='closed') continue;
      const desc = `${d.label}. ${d.at ? 'Official timezone: '+d.timezone+'.' : 'Date-only reminder; official cutoff time and timezone unconfirmed.'} ${e.note || ''}\nSource: ${d.source}\nVerified: ${e.verified_on}`;
      lines.push('BEGIN:VEVENT',`UID:${e.id}-${d.date}-${e.deadlines.indexOf(d)}@wangyy.phd`,`DTSTAMP:${stamp(now)}`);
      if(d.at) {lines.push(`DTSTART:${stamp(new Date(d.at))}`,`DTEND:${stamp(new Date(Date.parse(d.at)+60000))}`);}
      else {const end = new Date(d.date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push(`DTSTART;VALUE=DATE:${d.date.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,'')}`);}
      lines.push(`SUMMARY:${icsEscape(e.title+' — '+d.label)}`,`DESCRIPTION:${icsEscape(desc)}`,`URL:${d.source}`,'TRANSP:TRANSPARENT','END:VEVENT');
    }
    if(e.event && (includeClosed || Date.parse(e.event.end+'T23:59:59-12:00')>=now.getTime())){
      const end = new Date(e.event.end+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
      // Multiple tracks of one conference share a meeting UID, deduplicated below.
      const meetingId = `${e.event.start}-${e.event.venue.toLowerCase().replace(/[^a-z0-9]/g,'')}`;
      const uid=`UID:meeting-${meetingId}@wangyy.phd`;
      if(!lines.includes(uid)) lines.push('BEGIN:VEVENT',uid,`DTSTAMP:${stamp(now)}`,`DTSTART;VALUE=DATE:${e.event.start.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,'')}`,`SUMMARY:${icsEscape(e.title.split(' · ')[0])}`,`LOCATION:${icsEscape(e.event.venue+', '+e.event.city)}`,`URL:${e.website}`,'TRANSP:TRANSPARENT','END:VEVENT');
    }
  }
  return lines.concat('END:VCALENDAR').map(fold).join('\r\n')+'\r\n';
}
function download(entries, includeClosed) {const blob=new Blob([calendarText(entries,new Date(),includeClosed)],{type:'text/calendar;charset=utf-8'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download='submission-calendar.ics';a.click();setTimeout(()=>URL.revokeObjectURL(href),2000);}
function badge(e,d,now) {if(e.submission_mode==='estimated')return ['Estimated month','urgent'];if(e.submission_mode==='rolling')return ['Rolling submissions',''];if(!d)return [e.submission_mode==='tba'?'Dates to be announced':'Closed','closed'];const s=deadlineState(d,now);return s==='check'?['Check today’s cutoff','urgent']:s==='urgent'?['Due soon','urgent']:['Upcoming',''];}
function card(e,now) {
  const d=nextDeadline(e,now)||[...e.deadlines].sort((a,b)=>sortTime(b)-sortTime(a))[0];
  const [label,style]=badge(e,nextDeadline(e,now),now);
  const meta=e.event?`${dateRange(e.event)} · ${e.event.city}`:e.estimate?'Meeting dates & location to be announced':e.cycle;
  const rows=e.deadlines.map(x=>`<div class="date-line"><b>${esc(x.label)}</b><a href="${esc(url(x.source))}" target="_blank" rel="noopener noreferrer">${esc(x.at?exactText(x,x.timezone):dateText(x.date))} ↗</a><small>${x.at?esc(x.timezone):'Time / timezone unconfirmed'}</small>${x.at?`<small class="local-time">Your time: ${esc(exactText(x,Intl.DateTimeFormat().resolvedOptions().timeZone))}</small>`:''}</div>`).join('');
  return `<details class="opportunity" id="${esc(e.id)}"><summary><div class="venue"><span class="venue-type">${TYPE[e.kind]} · ${esc(e.topics.map(t=>AREA[t]).join(' / '))}</span><h3>${esc(e.title)}</h3><p class="venue-meta">${esc(meta)}</p></div><div class="deadline"><span class="badge ${style}">${label}</span><span class="deadline-date">${e.estimate?esc(monthText(e.estimate.month)):d?esc(dateText(d.date)):e.submission_mode==='rolling'?'No fixed deadline':'To be announced'}</span><span class="deadline-label">${esc(e.estimate?'Next regular submission · forecast':d?.label||e.cycle)}</span></div><span class="chevron" aria-hidden="true">+</span></summary><div class="detail"><div class="detail-grid"><div><h4>${e.deadlines.length?'Dates & deadlines':'Submission window'}</h4>${e.estimate?`<p class="venue-meta">Expected: ${esc(monthText(e.estimate.month))}<br>Basis: <a href="${esc(url(e.estimate.basis_url))}" target="_blank" rel="noopener noreferrer">${esc(e.estimate.basis_cycle)} regular CFP ↗</a><br>Previous deadline: ${esc(dateText(e.estimate.basis_date))}</p>`:rows||'<p class="venue-meta">Regular submissions; no issue-specific closing date.</p>'}${e.event?`<h4 style="margin-top:16px">Meeting</h4><p class="venue-meta">${esc(dateRange(e.event))}<br>${esc(e.event.venue)}<br>${esc(e.event.city)}</p>`:''}</div><div><h4>${e.estimate?'Previous-cycle format · recheck next CFP':'Format & submission requirements'}</h4><ul class="format-list">${e.format.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></div></div>${e.note?`<p class="note">${esc(e.note)}</p>`:''}<div class="links">${e.links.map(l=>`<a href="${esc(url(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join('')}</div><div class="detail-bottom"><span>Verified ${esc(e.verified_on)} · <a href="${esc(url(e.website))}" target="_blank" rel="noopener noreferrer">Official website</a></span>${e.deadlines.length||e.event?`<button class="calendar" data-calendar="${esc(e.id)}">↓ Add dates to calendar</button>`:''}</div></div></details>`;
}
async function start() {
  const results=document.querySelector('#results');
  try {
    const response=await fetch('./data.json',{cache:'no-cache'});if(!response.ok)throw new Error('Calendar data could not be loaded.');
    const data=await response.json();let topic='all',shown=[];let entries=data.entries.map(e=>nextEdition(e));
    document.querySelector('#updated').textContent='Last updated '+dateText(data.updated_on);
    const now=new Date();document.querySelector('#count-upcoming').textContent=entries.filter(e=>nextDeadline(e,now)).length;document.querySelector('#count-conferences').textContent=entries.filter(e=>e.estimate).length;document.querySelector('#count-journals').textContent=entries.filter(e=>e.kind!=='conference').length;
    const search=document.querySelector('#search'),kind=document.querySelector('#kind'),sort=document.querySelector('#sort'),exp=document.querySelector('#export');
    function render(){const now=new Date();entries=data.entries.map(e=>nextEdition(e,now));const q=search.value.trim().toLowerCase();const open=new Set([...results.querySelectorAll('details[open]')].map(x=>x.id));
      shown=entries.filter(e=>(kind.value==='all'||e.kind===kind.value)&&(topic==='all'||e.topics.includes(topic))&&(!q||[e.title,e.cycle,...e.topics.map(t=>AREA[t]),e.event?.city,e.event?.venue,...e.format,e.note].join(' ').toLowerCase().includes(q)));
      shown.sort((a,b)=>sort.value==='name'?a.title.localeCompare(b.title):sort.value==='meeting'?(a.event?.start||'9999').localeCompare(b.event?.start||'9999'):((nextDeadline(a,now)?sortTime(nextDeadline(a,now)):a.estimate?Date.parse(a.estimate.month+'-01T00:00:00Z'):Infinity)-(nextDeadline(b,now)?sortTime(nextDeadline(b,now)):b.estimate?Date.parse(b.estimate.month+'-01T00:00:00Z'):Infinity)||a.title.localeCompare(b.title)));
      results.innerHTML=shown.length?shown.map(e=>card(e,now)).join(''):'<p class="empty" role="status">No matching opportunities. Try another area or clear your search.</p>';for(const id of open){const el=document.getElementById(id);if(el)el.open=true;}document.querySelector('#result-count').textContent=`${shown.length} shown`;exp.disabled=!shown.some(e=>e.deadlines.length||e.event);
    }
    for(const el of [search,kind,sort])el.addEventListener(el===search?'input':'change',render);
    for(const b of document.querySelectorAll('[data-topic]'))b.addEventListener('click',()=>{topic=b.dataset.topic;document.querySelectorAll('[data-topic]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
    results.addEventListener('click',e=>{const b=e.target.closest('[data-calendar]');if(b)download(entries.filter(x=>x.id===b.dataset.calendar),false);});exp.addEventListener('click',()=>download(shown,false));render();setInterval(render,60000);
    const linked=document.getElementById(location.hash.slice(1));if(linked?.tagName==='DETAILS'){linked.open=true;linked.scrollIntoView();}
  } catch(error){results.textContent='Unable to load the calendar. Please reload this page or open the calendar data linked below.';const a=document.createElement('a');a.href='./data.json';a.textContent='Open calendar data';results.append(document.createElement('br'),a);}
}
if(typeof document!=='undefined')start();
