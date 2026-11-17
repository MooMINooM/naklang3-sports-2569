const SPORTS={football:'ฟุตบอล',volleyball:'วอลเลย์บอล',takraw:'ตะกร้อ',petanque:'เปตอง'};
const LEVELS={kg:'อนุบาล',lower:'ประถมต้น',upper:'ประถมปลาย',middle:'มัธยมต้น'};
const TYPES={boys:'ชาย',girls:'หญิง'};
const STAGES={group:'รอบกลุ่ม',league:'พบกันหมด',semi:'รอบรองฯ',third:'ชิงที่ 3',final:'ชิงชนะเลิศ'};
const DAYS=[1,2,3,4];
const FIELDS=[
 ['F1','ฟุตบอลอนุบาล','football','kg'],['F2','ฟุตบอลประถมต้น 1','football','lower'],['F3','ฟุตบอลประถมต้น 2','football','lower'],['F4','ฟุตบอลสนามหลัก','football','upper,middle'],
 ['V1','วอลเลย์บอลประถม','volleyball','upper'],['V2','วอลเลย์บอลมัธยม','volleyball','middle'],
 ['T1','ตะกร้อชาย','takraw','upper,middle','boys'],['T2','ตะกร้อหญิง','takraw','upper,middle','girls'],
 ['P1','เปตองชาย','petanque','upper,middle','boys'],['P2','เปตองหญิง 1','petanque','upper,middle','girls'],['P3','เปตองหญิง 2','petanque','upper,middle','girls'],
].map(([id,name,sport,levels,type=''])=>({id,name,sport,levels,type}));
const SCHOOLS=['บ้านท่าอุทัย','บ้านหนองด้วง','ซำขอนแก่น','บ้านโนนสวรรค์','บ้านโนนไหม','บ้านโนนสวาท','บ้านหนองกรุงศรี','บ้านภูพระโนนผักหวาน','บ้านโนนม่วง','บ้านโนนเมือง'];
const DURATION={football:{kg:25,lower:35,upper:41,middle:45},volleyball:90,takraw:30,petanque:90};
function duration(match, settings){
 const {sport,level,stage}=match;
 const groupMinutes=Number(settings.volleyballUpperGroupMinutes);
 if(sport==='volleyball'&&level==='upper'&&stage==='group'&&Number.isInteger(groupMinutes)&&groupMinutes>0)return groupMinutes;
 return typeof DURATION[sport]==='number'?DURATION[sport]:DURATION[sport]?.[level];
}
const minutes=s=>Number(s.split(':')[0])*60+Number(s.split(':')[1]);
const clock=n=>[Math.floor(n/60),n%60].map(x=>String(x).padStart(2,'0')).join(':');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function check(m,all,fields,settings){
 const len=duration(m,settings),f=fields.find(x=>x.id===m.field);
 if(!DAYS.includes(m.day)||!Number.isInteger(len)||!TYPES[m.type]||!STAGES[m.stage]||!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.start))return 'วัน เวลา หรือรายการแข่งขันไม่ถูกต้อง';
 const a=minutes(m.start), b=a+len;
 const end=m.day===4?(settings.endDay4||settings.end):settings.end;
 if(a<minutes(m.day===1?settings.minDay1:settings.minOther)||b>minutes(end))return 'เวลาคู่นี้อยู่นอกช่วงแข่งขัน';
 const conversion=(f?.id==='F2'||f?.id==='F3')&&Number(settings.convertDay)>0;
 const at=conversion?Number(settings.convertDay)*1440+minutes(settings.convertTime):Infinity;
 const t=m.day*1440+a;
 const allowed=conversion&&t>=at?['upper','middle']:f?.levels.split(',');
 if(!f||f.sport!==m.sport||!allowed.includes(m.level)||(f.type&&f.type!==m.type)||(conversion&&t<at&&m.day*1440+b>at))return 'สนามไม่รองรับรายการนี้ในช่วงเวลาที่เลือก';
 if(!m.home||!m.away||m.home===m.away||m.home.length>100||m.away.length>100||/^[=+\-@]/.test(m.home)||/^[=+\-@]/.test(m.away))return 'กรอกชื่อคู่แข่งขันสองทีมที่ต่างกัน';
 if((m.level==='middle'&&m.stage!=='league')||(m.level!=='middle'&&m.stage==='league')||(m.stage==='group'&&!/^[ABC]$/.test(m.group)))return 'ตรวจรอบการแข่งขันและรหัสกลุ่ม';
 if((m.homeScore==='')!==(m.awayScore==='')||[m.homeScore,m.awayScore].some(x=>x!==''&&!(Number.isInteger(x)&&x>=0&&x<=999)))return 'กรอกคะแนนทั้งสองทีมเป็นจำนวนเต็ม 0–999';
 for(const n of all.filter(n=>n.id!==m.id)){
   const same=n.level===m.level&&n.type===m.type, sameSport=n.sport===m.sport;
   if(same&&sameSport&&m.stage===n.stage&&['group','league'].includes(m.stage)&&[n.home,n.away].includes(m.home)&&[n.home,n.away].includes(m.away))return 'มีคู่แข่งขันนี้ในรอบเดียวกันแล้ว';
   if(Number(n.day)!==m.day)continue;
   const c=minutes(n.start),d=c+duration(n,settings);
   const anchored=same&&['football','volleyball'].includes(m.sport)&&['football','volleyball'].includes(n.sport);
   const repeat=same&&sameSport&&[n.home,n.away].some(team=>team===m.home||team===m.away);
   if(n.field===m.field&&a<d&&c<b)return 'สนามมีคิวชนกับ '+n.home+' พบ '+n.away;
   if((anchored&&a<d+15&&c<b+15)||(repeat&&a<d&&c<b))return 'คิวชนหรือเวลาพักไม่ครบกับ '+n.home+' พบ '+n.away;
 }
 return '';
}
const COLUMNS=['id','day','start','sport','level','type','field','home','away','stage','group','homeScore','awayScore','published','tieWinner'];
const FIELD_COLUMNS=['id','name','sport','levels','type'];
const DEFAULT_SETTINGS={minDay1:'10:15',minOther:'08:00',end:'17:30',convertDay:'',convertTime:'',endDay4:'',volleyballUpperGroupMinutes:''};

function doGet(e){
 const bridgeId=e && e.parameter && e.parameter.bridge;
 if(bridgeId && /^[a-f0-9]{32}$/.test(bridgeId)){
   const bridge=HtmlService.createTemplateFromFile('Bridge');
   bridge.bridgeId=bridgeId;
   return bridge.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
 }
 return HtmlService.createHtmlOutputFromFile('Index')
   .setTitle('สนามกลาง · กีฬานักเรียน นากลาง 3')
   .addMetaTag('viewport','width=device-width, initial-scale=1');
}

function setupSports_(){
 const book=SpreadsheetApp.getActiveSpreadsheet();
 if(!book)throw new Error('เปิด Apps Script จาก Google Sheets แล้วเรียก setupSports_ อีกครั้ง');
 PropertiesService.getScriptProperties().setProperty('SPORTS_SHEET_ID',book.getId());
 book.setSpreadsheetTimeZone('Asia/Bangkok');
 createTable_(book,'Matches',COLUMNS,[]);
 createTable_(book,'Roster',ROSTER_COLUMNS,[]);
 createTable_(book,'Fields',FIELD_COLUMNS,FIELDS.map(f=>FIELD_COLUMNS.map(k=>f[k])));
 createTable_(book,'Schools',['name'],SCHOOLS.map(x=>[x]));
 createTable_(book,'Settings',['key','value'],Object.entries(DEFAULT_SETTINGS));
}

function createTable_(book,name,cols,seed){
 const sheet=book.getSheetByName(name)||book.insertSheet(name);
 if(sheet.getLastRow()) return;
 const rows=[cols,...seed];
 if(name==='Matches')sheet.getRange('C:C').setNumberFormat('@');
 if(name==='Settings')sheet.getRange('B:B').setNumberFormat('@');
 sheet.getRange(1,1,rows.length,cols.length).setValues(rows);
 sheet.setFrozenRows(1);
 sheet.getRange(1,1,1,cols.length).setFontWeight('bold').setBackground('#d6ecdf');
}

function book_(){
 const id=PropertiesService.getScriptProperties().getProperty('SPORTS_SHEET_ID');
 if(!id)throw new Error('ยังไม่ได้ตั้งค่า Google Sheets ให้รัน setupSports_ ก่อน');
 return SpreadsheetApp.openById(id);
}

function rows_(sheet,keys){
 if(!sheet)throw new Error('แท็บข้อมูลไม่ครบ ให้รัน setupSports_');
 const last=sheet.getLastRow();
 if(last<2)return [];
 return sheet.getRange(2,1,last-1,keys.length).getValues().map((r,i)=>{
   const item={_row:i+2};
   keys.forEach((k,j)=>item[k]=r[j] instanceof Date?Utilities.formatDate(r[j],'Asia/Bangkok','HH:mm'):r[j]);
   return item;
 }).filter(x=>x[keys[0]]!=='');
}

function authorized_(key){
 const actual=PropertiesService.getScriptProperties().getProperty('SPORTS_ADMIN_KEY');
 return !!actual&&typeof key==='string'&&key===actual;
}

function readSports_(book){
 const matches=rows_(book.getSheetByName('Matches'),COLUMNS).map(m=>({...m,day:Number(m.day),published:m.published===true||String(m.published).toUpperCase()==='TRUE',homeScore:m.homeScore===''?'':Number(m.homeScore),awayScore:m.awayScore===''?'':Number(m.awayScore)}));
 const fields=rows_(book.getSheetByName('Fields'),FIELD_COLUMNS);
 const schools=rows_(book.getSheetByName('Schools'),['name']).map(r=>String(r.name));
 const settings={...DEFAULT_SETTINGS,...Object.fromEntries(rows_(book.getSheetByName('Settings'),['key','value']).map(r=>[r.key,String(r.value)]))};
 return {matches,fields,schools,settings};
}

function getSportsData(key){
 const canEdit=authorized_(key);
 const book=book_();
 const data=readSports_(book);
 const competition=competition_(data.matches.filter(x=>canEdit||x.published),roster_(book),canEdit);
 data.fields=data.fields.map(({_row,...f})=>f);
 return {...data,...competition,canEdit,formatVersion:3};
}

function saveSportsMatch(key,input){
 if(!authorized_(key))throw new Error('ต้องใช้รหัสผู้จัดที่ถูกต้อง');
 const lock=LockService.getScriptLock();
 lock.waitLock(10000);
 try{
   const book=book_();
   const {matches,fields,settings}=readSports_(book);
   const m=Object.fromEntries(COLUMNS.map(k=>[k,input[k]]));
   if(['id','start','sport','level','type','field','home','away','stage','group'].some(k=>typeof m[k]!=='string')||typeof m.published!=='boolean')throw new Error('ข้อมูลไม่ถูกต้อง');
   m.tieWinner=input.tieWinner||'';
   const prior=matches.find(x=>x.id===m.id);
   if(m.id&&!prior)throw new Error('ไม่พบคู่ที่ต้องการแก้ไข');
   if(prior&&managed_(prior)&&['sport','level','type','stage','group','home','away'].some(k=>m[k]!==prior[k]))throw new Error('แก้ชื่อทีมจากหน้าบันทึกผลจับสลาก');
   const tiedKnockout=scored_(m)&&m.homeScore===m.awayScore&&['semi','third','final'].includes(m.stage);
   if(tiedKnockout&&!['home','away'].includes(m.tieWinner))throw new Error('เลือกผู้ชนะจากการตัดสินกรณีคะแนนเท่ากัน');
   if(!tiedKnockout)m.tieWinner='';
   const error=check(m,matches,fields,settings);
   if(error)throw new Error(error);
   m.id=m.id||Utilities.getUuid();
   const roster=roster_(book);
   const event=matches.filter(row=>eventKey_(row)===eventKey_(m));
   const updated=event.filter(row=>row.id!==m.id).concat(m);
   const derived=competition_(updated,roster,true).matches.find(row=>row.id===m.id);
   if(scored_(m)&&!derived.ready)throw new Error('ต้องทราบทีมแข่งขันทั้งสองฝั่งก่อนบันทึกผล');
   checkDependencies_(event,updated,roster,roster);
   const row=COLUMNS.map(k=>m[k]);
   const sheet=book.getSheetByName('Matches');
   sheet.getRange(prior?prior._row:sheet.getLastRow()+1,1,1,row.length).setValues([row]);
   SpreadsheetApp.flush();
   return m.id;
 }finally{lock.releaseLock();}
}

const ROSTER_SLOTS=['A1','A2','A3','A4','B1','B2','B3','C1','C2','C3','1','2','3','4'];
const ROSTER_COLUMNS=['event',...ROSTER_SLOTS,'tieOrder'];
const SEMI_LABELS=['แชมป์สายตามประกบ¹','รองแชมป์สายผลงานดีที่สุด','แชมป์สายที่เหลือ 1','แชมป์สายที่เหลือ 2'];
const eventKey_=m=>[m.sport,m.level,m.type].join(':');

function slotOf_(name){
 const group=/^สาย ([ABC]) · ทีม ([1-4])$/.exec(name);
 if(group)return group[1]+group[2];
 return /^ทีม ([1-4])$/.exec(name)?.[1];
}

function bracketSource_(name){
 return SEMI_LABELS.includes(name)||/^(ชนะ|แพ้) [A-Z0-9]+-\d+$/.test(name);
}

function managed_(m){
 return [m.home,m.away].some(name=>slotOf_(name)||bracketSource_(name));
}

function scored_(m){
 return m.homeScore!==''&&m.awayScore!=='';
}

function resultSide_(m){
 if(!scored_(m))return '';
 if(m.homeScore>m.awayScore)return 'home';
 if(m.homeScore<m.awayScore)return 'away';
 return m.tieWinner||'';
}

function compareRank_(a,b,normalized){
 const an=normalized?a.played:1,bn=normalized?b.played:1;
 for(const k of ['points','difference','goals']){
   const delta=b[k]*an-a[k]*bn;
   if(delta)return delta;
 }
 return 0;
}

function seedGroups_(matches,draw){
 const groups=['A','B','C'].map(group=>matches.filter(m=>m.stage==='group'&&m.group===group));
 const tieOrder=String(draw.tieOrder||'').split(',').filter(Boolean);
 const position=slot=>tieOrder.includes(slot)?tieOrder.indexOf(slot):Infinity;
 const compare=(a,b,normalized)=>compareRank_(a,b,normalized)||(position(a.name)===position(b.name)?0:position(a.name)-position(b.name));
 const champions=[],runners=[];
 for(const group of groups){
   if(!group.length||group.some(m=>!scored_(m)))return {};
   const rows=new Map();
   for(const m of group){
     for(const [label,own,opp] of [[m.home,m.homeScore,m.awayScore],[m.away,m.awayScore,m.homeScore]]){
       const name=slotOf_(label)||label;
       if(!rows.has(name))rows.set(name,{name,label,group:m.group,played:0,points:0,difference:0,goals:0});
       const row=rows.get(name);
       row.played++;
       row.points+=own>opp?(m.sport==='football'?3:1):own===opp&&m.sport==='football'?1:0;
       row.difference+=own-opp;
       row.goals+=own;
     }
   }
   const rank=[...rows.values()].sort((a,b)=>compare(a,b,false));
   if(rank.length<2||compare(rank[0],rank[1],false)===0||rank[2]&&compare(rank[1],rank[2],false)===0)return {pendingTie:true};
   champions.push(rank[0]);
   runners.push(rank[1]);
 }
 runners.sort((a,b)=>compare(a,b,true));
 if(compare(runners[0],runners[1],true)===0)return {pendingTie:true};
 const wildcard=runners[0];
 const opponentIndex=('ABC'.indexOf(wildcard.group)+1)%3;
 return {wildcard,opponent:champions[opponentIndex],others:champions.filter((_,i)=>i!==opponentIndex)};
}

function competition_(matches,roster,canEdit){
 const events=new Map(),resolved=new Map(),draws=[],qualifiers=[];
 for(const m of matches){
   const k=eventKey_(m);
   if(!events.has(k))events.set(k,[]);
   events.get(k).push(m);
 }
 for(const [key,event] of events){
   const draw=roster.get(key)||{};
   const slots=ROSTER_SLOTS.filter(slot=>event.some(m=>[m.home,m.away].some(n=>slotOf_(n)===slot)));
   const {sport,level,type}=event[0];
   const seeds=seedGroups_(event,draw);
   const named=label=>{const slot=slotOf_(label);return slot?draw[slot]||'':label;};
   if(canEdit&&slots.length)draws.push({key,sport,level,type,slots,teams:Object.fromEntries(slots.map(slot=>[slot,draw[slot]||''])),tieOrder:String(draw.tieOrder||'')});
   if(seeds.wildcard)qualifiers.push({sport,level,type,group:seeds.wildcard.group,team:named(seeds.wildcard.label)||seeds.wildcard.label});
   else if(seeds.pendingTie)qualifiers.push({sport,level,type,pendingTie:true});
   const semiTeams=seeds.wildcard?[seeds.opponent,seeds.wildcard,...seeds.others].map(seed=>named(seed.label)):[];
   function participant(label){
     const index=SEMI_LABELS.indexOf(label);
     if(index>=0)return semiTeams[index]||'';
     const dep=/^(ชนะ|แพ้) ([A-Z0-9]+-\d+)$/.exec(label);
     if(dep){
       const previous=resolved.get(dep[2]);
       if(!previous||eventKey_(previous)!==key||!previous.winnerSide)return '';
       const win=previous.winnerSide;
       return dep[1]==='ชนะ'?previous[win]:(win==='home'?previous.away:previous.home);
     }
     return named(label);
   }
   for(const m of [...event.filter(m=>!['third','final'].includes(m.stage)),...event.filter(m=>['third','final'].includes(m.stage))]){
     const home=participant(m.home),away=participant(m.away);
     const ready=Boolean(home&&away);
     const winnerSide=ready?resultSide_(m):'';
     const {_row,...match}=m;
     resolved.set(m.id,{...match,home:home||m.home,away:away||m.away,ready,winnerSide,
       ...(canEdit?{rawHome:m.home,rawAway:m.away,managed:managed_(m)}:{})});
   }
 }
 return {matches:matches.map(m=>resolved.get(m.id)),draws,qualifiers};
}

function roster_(book){
 const sheet=book.getSheetByName('Roster');
 return new Map(sheet?rows_(sheet,ROSTER_COLUMNS).map(row=>[row.event,row]):[]);
}

function saveSportsDraw(key,input){
 if(!authorized_(key))throw new Error('ต้องใช้รหัสผู้จัดที่ถูกต้อง');
 const lock=LockService.getScriptLock();
 lock.waitLock(10000);
 try{
   const book=book_();
   const {matches}=readSports_(book);
   const roster=roster_(book);
   const event=matches.filter(m=>eventKey_(m)===input?.key);
   const draw=competition_(event,roster,true).draws[0];
   if(!draw)throw new Error('ไม่พบรายการจับสลาก');
   const proposed={};
   for(const slot of draw.slots){
     const name=input.teams?.[slot];
     if(typeof name!=='string'||name.length>100||/^[=+\-@]/.test(name.trim())||slotOf_(name.trim())||bracketSource_(name.trim()))throw new Error('ชื่อทีมไม่ถูกต้อง');
     proposed[slot]=name.trim();
   }
   const names=Object.values(proposed).filter(Boolean);
   if(new Set(names).size!==names.length)throw new Error('โรงเรียนหรือทีมเดียวกันมีได้หนึ่งช่องต่อรายการ');
   const tieOrder=String(input.tieOrder||'').toUpperCase().split(/[\s,]+/).filter(Boolean);
   if(!tieOrder.every(slot=>draw.slots.includes(slot))||new Set(tieOrder).size!==tieOrder.length)throw new Error('กรอกรหัสทีมสำหรับตัดสินอันดับให้ถูกต้องและไม่ซ้ำ');
   proposed.tieOrder=tieOrder.join(',');
   checkDependencies_(event,event,roster,new Map(roster).set(draw.key,proposed));
   createTable_(book,'Roster',ROSTER_COLUMNS,[]);
   const sheet=book.getSheetByName('Roster');
   const row=roster.get(draw.key)?._row||sheet.getLastRow()+1;
   sheet.getRange(row,1,1,ROSTER_COLUMNS.length).setValues([[draw.key,...ROSTER_COLUMNS.slice(1).map(k=>proposed[k]||'')]]);
   SpreadsheetApp.flush();
   return true;
 }finally{lock.releaseLock();}
}

function checkDependencies_(before,after,priorRoster,nextRoster){
 const recorded=competition_(before,priorRoster,true).matches.filter(scored_);
 const updated=new Map(competition_(after,nextRoster,true).matches.map(m=>[m.id,m]));
 for(const old of recorded){
   const next=updated.get(old.id);
   if(next&&scored_(next)&&(old.home!==next.home||old.away!==next.away))throw new Error('กรุณาล้างผลของคู่รอบถัดไปที่ได้รับผลกระทบก่อน');
 }
}
