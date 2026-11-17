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
const COLUMNS=['id','day','start','sport','level','type','field','home','away','stage','group','homeScore','awayScore','published'];
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
 const data=readSports_(book_());
 data.matches=data.matches.filter(x=>canEdit||x.published).map(({_row,...m})=>m);
 data.fields=data.fields.map(({_row,...f})=>f);
 return {...data,canEdit};
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
   const error=check(m,matches,fields,settings);
   if(error)throw new Error(error);
   const prior=matches.find(x=>x.id===m.id);
   if(m.id&&!prior)throw new Error('ไม่พบคู่ที่ต้องการแก้ไข');
   m.id=m.id||Utilities.getUuid();
   const row=COLUMNS.map(k=>m[k]);
   const sheet=book.getSheetByName('Matches');
   sheet.getRange(prior?prior._row:sheet.getLastRow()+1,1,1,row.length).setValues([row]);
   SpreadsheetApp.flush();
   return m.id;
 }finally{lock.releaseLock();}
}
