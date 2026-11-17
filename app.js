(function () {
  'use strict';
  const C = window.NAKLANG_CONFIG || {};
  const data = {schools:[],teams:[],events:[],venues:[],matches:[]};
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
  const options = function (items, empty, value, label) {
    return '<option value="">' + esc(empty) + '</option>' +
      items.map(function (x) { return '<option value="' + esc(value(x)) + '">' + esc(label(x)) + '</option>'; }).join('');
  };
  const lookup = function (list,id) { return list.find(function(x){return x.id===id;}) || null; };
  const eventOf = function (m) { return lookup(data.events,m.event_id); };
  const venueOf = function (m) { return lookup(data.venues,m.venue_id); };
  const eventLabel = function (x) { return x ? x.sport + ' · ' + x.division + x.gender : 'ไม่ทราบรายการ'; };
  const nameOf = function (id, fallback) { const t=lookup(data.teams,id); return t ? t.name : (fallback || 'รอระบุทีม'); };
  const validApi = function () { return typeof C.apiUrl === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(C.apiUrl.trim()); };
  const api = function () { return C.apiUrl.trim(); };
  let busy=false;

  function note(message,type) {
    const box=$('notice'); box.textContent=message; box.className='notice show' + (type?' '+type:'');
  }
  function setSync(message,online) {
    $('sync-status').textContent=message;
    document.querySelector('.sync-dot').classList.toggle('online',!!online);
  }
  function readData() {
    return new Promise(function(resolve,reject){
      if (!validApi()) { reject(new Error('ยังไม่ได้กำหนด API URL ใน config.js')); return; }
      const id='naklang_cb_' + Date.now() + '_' + Math.floor(Math.random()*100000000);
      const script=document.createElement('script');
      let finished=false, timer;
      function cleanup(){
        if(finished)return;
        finished=true; clearTimeout(timer); delete window[id]; script.remove();
      }
      window[id]=function(result) {
        cleanup();
        if (!result || !result.ok || !result.data) { reject(new Error(result && result.error ? result.error : 'ข้อมูลจาก API ไม่ถูกต้อง')); return; }
        resolve(result);
      };
      script.onerror=function(){cleanup();reject(new Error('ติดต่อ Apps Script ไม่สำเร็จ กรุณาตรวจการเผยแพร่ Web app'));};
      timer=setTimeout(function(){cleanup();reject(new Error('การเชื่อมต่อหมดเวลา'));},30000);
      script.src=api()+(api().indexOf('?')>=0?'&':'?')+'action=bootstrap&callback='+encodeURIComponent(id)+'&_='+Date.now();
      document.head.appendChild(script);
    });
  }
  function apply(payload) {
    Object.keys(data).forEach(function(k){data[k]=Array.isArray(payload.data[k])?payload.data[k]:[];});
    $('stat-all').textContent=data.matches.length;
    $('stat-done').textContent=data.matches.filter(function(m){return m.status==='finished';}).length;
    $('stat-live').textContent=data.matches.filter(function(m){return m.status==='live';}).length;
    $('stat-next').textContent=data.matches.filter(function(m){return m.status==='scheduled' || !m.status;}).length;
    const when=new Date(payload.timestamp || Date.now());
    setSync('เชื่อมต่อ Google Sheets แล้ว · อัปเดต '+when.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),true);
    renderFilters(); renderMatches(); renderTeams(); renderStandings(); renderAdmin();
  }
  async function refresh(silent) {
    try {
      if (!silent) setSync('กำลังดึงข้อมูลจาก Google Sheets…',false);
      const response=await readData();
      apply(response);
      if(!silent) {$('notice').className='notice';}
      return true;
    } catch(err) {
      setSync('ยังไม่เชื่อมต่อ Google Sheets',false);
      if(!silent) note(String(err.message || err),'warning');
      return false;
    }
  }
  function sortedMatches() {
    return data.matches.slice().sort(function(a,b){return (a.date+' '+a.start+' '+a.id).localeCompare(b.date+' '+b.start+' '+b.id);});
  }
  function unique(values) { return Array.from(new Set(values.filter(Boolean))).sort(); }
  function selectPreserve(id,html) {
    const el=$(id),prev=el.value; el.innerHTML=html;
    if(Array.from(el.options).some(function(o){return o.value===prev;})) el.value=prev;
  }
  function renderFilters() {
    selectPreserve('filter-date',options(unique(data.matches.map(function(x){return x.date;})),'ทุกวัน',function(x){return x;},function(x){return x;}));
    selectPreserve('filter-sport',options(unique(data.events.map(function(x){return x.sport;})),'ทุกกีฬา',function(x){return x;},function(x){return x;}));
    selectPreserve('filter-division',options(unique(data.events.map(function(x){return x.division+x.gender;})),'ทุกรุ่น',function(x){return x;},function(x){return x;}));
    selectPreserve('stand-event',options(data.events,'เลือกรายการ',function(x){return x.id;},eventLabel));
    const schools=data.schools.slice().sort(function(a,b){return a.name.localeCompare(b.name,'th');});
    selectPreserve('team-school',options(schools,'ทีมร่วม / ไม่ระบุโรงเรียน',function(x){return x.id;},function(x){return x.name;}));
    selectPreserve('match-event',options(data.events,'เลือกรายการ',function(x){return x.id;},eventLabel));
    updateMatchChoices();
    renderGroupFilter();
  }
  function updateMatchChoices() {
    const event=lookup(data.events,$('match-event').value);
    const venueOptions=data.venues.filter(function(v){return !event || v.sport===event.sport;});
    const teamOptions=data.teams.filter(function(t){return !event || (t.division===event.division && t.gender===event.gender);});
    selectPreserve('match-venue',options(venueOptions,'เลือกสนาม',function(x){return x.id;},function(x){return x.name;}));
    selectPreserve('match-home',options(teamOptions,'ยังไม่กำหนด',function(x){return x.id;},function(x){return x.name;}));
    selectPreserve('match-away',options(teamOptions,'ยังไม่กำหนด',function(x){return x.id;},function(x){return x.name;}));
  }
  function formatDate(s) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return s||'ไม่ระบุวัน';
    const d=new Date(s+'T12:00:00');
    return isNaN(d.getTime())?s:d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
  }
  function statusLabel(status){
    return status==='finished'?'จบการแข่งขัน':status==='live'?'กำลังแข่งขัน':'รอแข่งขัน';
  }
  function card(m) {
    const e=eventOf(m),v=venueOf(m);
    const score=m.status==='finished'||m.status==='live' ? esc(m.home_score)+' : '+esc(m.away_score) : 'VS';
    return '<div class="match-card">' +
      '<div class="match-meta"><b>'+esc(formatDate(m.date))+' · '+esc(m.start||'')+'–'+esc(m.end||'')+'</b><span>'+esc(m.id)+' · '+esc(m.stage)+(m.group?' · กลุ่ม '+esc(m.group):'')+'</span></div>'+
      '<div class="pair"><span class="side">'+esc(nameOf(m.home_id,m.home_label))+'</span><span class="score">'+score+'</span><span class="side">'+esc(nameOf(m.away_id,m.away_label))+'</span></div>'+
      '<div class="meta-right"><div>'+esc(eventLabel(e))+'</div><span class="small">'+esc(v?v.name:'ไม่ระบุสนาม')+'</span><div><span class="status '+esc(m.status||'')+'">'+esc(statusLabel(m.status))+'</span></div></div></div>';
  }
  function renderMatches() {
    const day=$('filter-date').value,sport=$('filter-sport').value,div=$('filter-division').value;
    const query=$('filter-search').value.trim().toLocaleLowerCase('th-TH');
    const list=sortedMatches().filter(function(m){
      const e=eventOf(m),v=venueOf(m);
      if(day&&m.date!==day)return false;
      if(sport&&(!e||e.sport!==sport))return false;
      if(div&&(!e||e.division+e.gender!==div))return false;
      const hay=[m.id,m.stage,m.group,m.date,m.home_label,m.away_label,nameOf(m.home_id,''),nameOf(m.away_id,''),e&&eventLabel(e),v&&v.name].join(' ').toLocaleLowerCase('th-TH');
      return !query||hay.indexOf(query)>=0;
    });
    $('match-results').className=list.length?'matches':'empty';
    $('match-results').innerHTML=list.length?list.map(card).join(''):'ไม่พบคู่แข่งขันตามเงื่อนไข';
  }
  function renderTeams() {
    let html='';
    if(data.teams.length) {
      html='<div class="team-grid">'+data.teams.slice().sort(function(a,b){return a.name.localeCompare(b.name,'th');}).map(function(t){
        const s=lookup(data.schools,t.school_id);
        return '<div class="team-item"><strong>'+esc(t.name)+'</strong><small>'+esc(t.division+t.gender)+' · '+esc(s?s.name:'ทีมร่วม / ไม่ระบุโรงเรียน')+'</small></div>';
      }).join('')+'</div>';
    } else if(data.schools.length) {
      html='<p class="hint">บันทึกโรงเรียนตั้งต้นแล้ว '+data.schools.length+' แห่ง กรุณาเพิ่มทีมที่ส่งเข้าร่วมการแข่งขันจากเมนูจัดการข้อมูล</p>'+
        '<div class="team-grid">'+data.schools.map(function(s){return '<div class="team-item"><strong>'+esc(s.name)+'</strong><small>ยังไม่เพิ่มทีมแข่งขัน</small></div>';}).join('')+'</div>';
    } else html='ยังไม่มีรายชื่อทีมและโรงเรียน';
    $('team-results').className=data.schools.length||data.teams.length?'':'empty';
    $('team-results').innerHTML=html;
  }
  function renderGroupFilter() {
    const eventId=$('stand-event').value;
    const groups=unique(data.matches.filter(function(m){return m.event_id===eventId&&m.group;}).map(function(m){return m.group;}));
    selectPreserve('stand-group',options(groups,'ทุกกลุ่ม',function(g){return g;},function(g){return 'กลุ่ม '+g;}));
  }
  function renderStandings() {
    const eventId=$('stand-event').value,group=$('stand-group').value;
    if(!eventId){$('stand-results').className='empty';$('stand-results').textContent='เลือกรายการแข่งขันเพื่อดูอันดับ';return;}
    const rows=new Map();
    const eligible=data.matches.filter(function(m){
      return m.event_id===eventId&&m.status==='finished'&&
        ['พบกันหมด','รอบแบ่งกลุ่ม'].indexOf(m.stage)>=0&&
        (!group||m.group===group)&&m.home_id&&m.away_id;
    });
    function entry(id){
      if(!rows.has(id))rows.set(id,{id:id,played:0,w:0,d:0,l:0,scored:0,conceded:0,points:0});
      return rows.get(id);
    }
    eligible.forEach(function(m){
      const a=Number(m.home_score),b=Number(m.away_score);
      if(!Number.isFinite(a)||!Number.isFinite(b))return;
      const x=entry(m.home_id),y=entry(m.away_id);
      x.played++;y.played++;x.scored+=a;x.conceded+=b;y.scored+=b;y.conceded+=a;
      if(a>b){x.w++;y.l++;x.points+=3;}
      else if(a<b){y.w++;x.l++;y.points+=3;}
      else {x.d++;y.d++;x.points++;y.points++;}
    });
    const list=Array.from(rows.values()).sort(function(a,b){
      return b.points-a.points||((b.scored-b.conceded)-(a.scored-a.conceded))||b.scored-a.scored||nameOf(a.id).localeCompare(nameOf(b.id),'th');
    });
    $('stand-results').className=list.length?'table-wrap':'empty';
    if(!list.length){$('stand-results').textContent='ยังไม่มีผลการแข่งขันรอบกลุ่มหรือพบกันหมด';return;}
    $('stand-results').innerHTML='<table><thead><tr><th class="num">อันดับ*</th><th>ทีม</th><th class="num">แข่ง</th><th class="num">ชนะ</th><th class="num">เสมอ</th><th class="num">แพ้</th><th class="num">ได้</th><th class="num">เสีย</th><th class="num">ต่าง</th><th class="num">คะแนน</th></tr></thead><tbody>'+
      list.map(function(r,i){return '<tr><td class="num">'+(i+1)+'</td><td>'+esc(nameOf(r.id))+'</td><td class="num">'+r.played+'</td><td class="num">'+r.w+'</td><td class="num">'+r.d+'</td><td class="num">'+r.l+'</td><td class="num">'+r.scored+'</td><td class="num">'+r.conceded+'</td><td class="num">'+(r.scored-r.conceded)+'</td><td class="num"><b>'+r.points+'</b></td></tr>';}).join('')+'</tbody></table><p class="small">* อันดับไม่ใช่ผลรับรองอย่างเป็นทางการ; กรณีคะแนนเท่ากันต้องใช้ระเบียบการแข่งขัน</p>';
  }
  function renderAdmin() {
    const list=sortedMatches();
    $('admin-results').className=list.length?'admin-list':'empty';
    $('admin-results').innerHTML=list.length?list.map(function(m) {
      const e=eventOf(m);
      return '<div class="admin-row"><div><strong>'+esc(m.id)+'</strong> · '+esc(eventLabel(e))+' · '+esc(nameOf(m.home_id,m.home_label))+' พบ '+esc(nameOf(m.away_id,m.away_label))+
      '<small>'+esc(m.date)+' '+esc(m.start)+'–'+esc(m.end)+' · '+esc(statusLabel(m.status))+'</small></div>'+
      '<div class="actions"><button class="outline" data-edit="'+esc(m.id)+'">แก้ไข</button><button class="outline" data-score="'+esc(m.id)+'">บันทึกผล</button><button class="danger" data-delete="'+esc(m.id)+'">ลบ</button></div></div>';
    }).join(''):'ยังไม่มีคู่แข่งขัน';
  }
  function fillMatch(id) {
    const m=lookup(data.matches,id); if(!m)return;
    const form=$('match-form');
    ['id','date','start','end','event_id','venue_id','group','stage','home_id','away_id','home_label','away_label'].forEach(function(k){
      const el=form.elements.namedItem(k); if(el && k!=='home_id' && k!=='away_id' && k!=='venue_id') el.value=m[k]||'';
    });
    updateMatchChoices();
    ['venue_id','home_id','away_id'].forEach(function(k){const el=form.elements.namedItem(k);if(el)el.value=m[k]||'';});
    form.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function verify(action,item) {
    if(action==='upsertTeam')return data.teams.some(function(t){return t.name===item.name&&t.division===item.division&&t.gender===item.gender&&t.school_id===(item.school_id||'');});
    if(action==='upsertMatch')return data.matches.some(function(m){return m.id===item.id&&m.date===item.date&&m.start===item.start&&m.venue_id===item.venue_id;});
    if(action==='deleteMatch')return !data.matches.some(function(m){return m.id===item.id;});
    if(action==='scoreMatch')return data.matches.some(function(m){return m.id===item.id&&m.status===item.status&&
      (item.status==='scheduled'||(m.home_score===String(item.home_score)&&m.away_score===String(item.away_score)));});
    return false;
  }
  function wait(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
  async function submit(action,item) {
    if(busy)return false;
    if(!validApi()){note('กรุณาตั้งค่า Google Apps Script URL ใน config.js ก่อน','warning');return false;}
    const password=$('admin-password').value;
    if(!password){note('กรุณากรอกรหัสผ่านผู้ดูแล','warning');return false;}
    busy=true;
    note('กำลังส่งคำสั่งและตรวจสอบกับ Google Sheets…');
    try {
      await fetch(api(),{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:action,data:item,password:password})});
      $('admin-password').value='';
      let confirmed=false;
      for(let i=0;i<3;i++){
        await wait(900+i*800);
        try {const res=await readData();apply(res);if(verify(action,item)){confirmed=true;break;}}catch(ignored){}
      }
      if(confirmed){note('บันทึกเรียบร้อยและตรวจพบข้อมูลใน Google Sheets','success');return true;}
      note('ยังยืนยันการบันทึกไม่ได้ กรุณาตรวจรหัสผ่าน ความถูกต้องของข้อมูล และ Apps Script Executions ก่อนส่งซ้ำ (อาจมีคิวหรือสนามชนกัน)','warning');
      return false;
    } catch(err) {
      note('ส่งคำสั่งไม่สำเร็จ: '+String(err.message||err),'error');return false;
    } finally {busy=false;}
  }

  document.querySelectorAll('[data-view]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const tab=btn.dataset.view;
      document.querySelectorAll('[data-view]').forEach(function(x){x.classList.toggle('active',x.dataset.view===tab);});
      ['matches','standings','teams','admin'].forEach(function(k){$('view-'+k).classList.toggle('hidden',k!==tab);});
    });
  });
  ['filter-date','filter-sport','filter-division'].forEach(function(k){$(k).addEventListener('change',renderMatches);});
  $('filter-search').addEventListener('input',renderMatches);
  $('stand-event').addEventListener('change',function(){renderGroupFilter();renderStandings();});
  $('stand-group').addEventListener('change',renderStandings);
  $('match-event').addEventListener('change',updateMatchChoices);
  $('reload').addEventListener('click',function(){refresh(false);});
  $('clear-match').addEventListener('click',function(){$('match-form').reset();updateMatchChoices();});
  $('team-form').addEventListener('submit',async function(ev){
    ev.preventDefault();const form=ev.currentTarget;
    const item=Object.fromEntries(new FormData(form).entries());
    const done=await submit('upsertTeam',item);if(done){form.reset();}
  });
  $('match-form').addEventListener('submit',async function(ev){
    ev.preventDefault();const form=ev.currentTarget;
    const item=Object.fromEntries(new FormData(form).entries());
    const done=await submit('upsertMatch',item);if(done){form.reset();updateMatchChoices();}
  });
  $('admin-results').addEventListener('click',async function(ev){
    const btn=ev.target.closest('button');if(!btn)return;
    if(btn.dataset.edit){fillMatch(btn.dataset.edit);return;}
    if(btn.dataset.delete){
      if(!confirm('ยืนยันลบคู่แข่งขัน '+btn.dataset.delete+' ?'))return;
      await submit('deleteMatch',{id:btn.dataset.delete});return;
    }
    if(btn.dataset.score){
      const m=lookup(data.matches,btn.dataset.score);if(!m)return;
      const state=prompt('สถานะ (scheduled / live / finished)',m.status||'finished');
      if(state===null)return;
      if(['scheduled','live','finished'].indexOf(state)<0){note('สถานะไม่ถูกต้อง','warning');return;}
      let home=0,away=0;
      if(state!=='scheduled'){
        const h=prompt('คะแนน '+nameOf(m.home_id,m.home_label),m.home_score||'0');
        if(h===null)return;
        const a=prompt('คะแนน '+nameOf(m.away_id,m.away_label),m.away_score||'0');
        if(a===null)return;
        home=Number(h);away=Number(a);
        if(!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0){note('คะแนนต้องเป็นจำนวนเต็มที่ไม่ติดลบ','warning');return;}
      }
      await submit('scoreMatch',{id:m.id,status:state,home_score:home,away_score:away});
    }
  });
  if(validApi()){
    refresh(false);
    setInterval(function(){if(!busy && document.visibilityState!=='hidden')refresh(true);},Math.max(20000,Number(C.refreshMs)||60000));
  } else {
    note('ขั้นตอนถัดไป: สร้าง Google Sheet ติดตั้ง Apps Script และตั้งค่า apiUrl ใน config.js ตาม README.md','warning');
    setSync('รอการเชื่อมต่อ Google Sheets',false);
  }
})();
