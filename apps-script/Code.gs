/**
 * Naklang 3 Sports 2569 — Google Sheets backend.
 * Install as a script bound to the intended Google Sheet.
 * Run setupSheets() and setAdminPassword() before deploying as a Web app.
 */
const DB = {
  Schools: ['id','name'],
  Teams: ['id','school_id','name','division','gender'],
  Events: ['id','sport','division','gender','format'],
  Venues: ['id','name','sport'],
  Matches: ['id','date','start','end','event_id','venue_id','group','stage','home_id','away_id','home_label','away_label','home_score','away_score','status','updated_at']
};

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('เปิด Apps Script จาก Extensions ของ Google Sheet ก่อน');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  Object.keys(DB).forEach(function(name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      const header = DB[name];
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, sheet.getMaxRows(), header.length).setNumberFormat('@');
      sheet.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#d8edff');
    }
  });
  if (read_('Schools').length === 0) {
    const names = ['บ้านท่าอุทัย','บ้านหนองด้วง','ซำขอนแก่น','บ้านโนนสวรรค์','บ้านโนนไหม','บ้านโนนสวาท','บ้านหนองกรุงศรี','บ้านภูพระโนนผักหวาน','บ้านโนนม่วง','บ้านโนนเมือง'];
    names.forEach(function(n, i) { append_('Schools', {id:'S' + (i+1), name:n}); });
  }
  if (read_('Events').length === 0) {
    const sports = [
      {sport:'ฟุตบอล', divisions:['อนุบาล','ประถมต้น','ประถมปลาย','มัธยมต้น']},
      {sport:'วอลเลย์บอล', divisions:['ประถมปลาย','มัธยมต้น']},
      {sport:'ตะกร้อ', divisions:['ประถมปลาย','มัธยมต้น']},
      {sport:'เปตอง', divisions:['ประถมปลาย','มัธยมต้น']}
    ];
    let i = 1;
    sports.forEach(function(s) {
      s.divisions.forEach(function(d) {
        ['ชาย','หญิง'].forEach(function(g) {
          append_('Events', {
            id:'E' + String(i++).padStart(2,'0'),
            sport:s.sport, division:d, gender:g,
            format:d === 'มัธยมต้น' ? 'พบกันหมด' : 'รอบแบ่งกลุ่ม'
          });
        });
      });
    });
  }
  if (read_('Venues').length === 0) {
    const venues = [
      ['F1','ฟุตบอลอนุบาล','ฟุตบอล'],['F2','ฟุตบอลประถมต้น 1','ฟุตบอล'],
      ['F3','ฟุตบอลประถมต้น 2','ฟุตบอล'],['F4','ฟุตบอลประถมปลาย/มัธยม','ฟุตบอล'],
      ['V1','วอลเลย์บอลประถมปลาย','วอลเลย์บอล'],['V2','วอลเลย์บอลมัธยมต้น','วอลเลย์บอล'],
      ['T1','ตะกร้อชาย','ตะกร้อ'],['T2','ตะกร้อหญิง','ตะกร้อ'],
      ['P1','เปตองชาย','เปตอง'],['P2','เปตองหญิง 1','เปตอง'],['P3','เปตองหญิง 2','เปตอง']
    ];
    venues.forEach(function(v) { append_('Venues',{id:v[0],name:v[1],sport:v[2]}); });
  }
  SpreadsheetApp.flush();
  return 'พร้อมใช้งาน: ' + ss.getUrl();
}

function setAdminPassword() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('ตั้งรหัสผ่านผู้ดูแล', 'ใช้รหัสอย่างน้อย 12 ตัวอักษร ห้ามใช้ซ้ำกับบัญชี Google', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const pass = response.getResponseText();
  if (pass.length < 12) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร');
  const props = PropertiesService.getScriptProperties();
  const salt = Utilities.getUuid() + Utilities.getUuid();
  props.setProperties({ADMIN_SALT:salt,ADMIN_HASH:sha256_(salt + pass)});
  ui.alert('ตั้งรหัสผ่านเรียบร้อย เก็บรหัสไว้ส่วนตัวและไม่ใส่ใน GitHub');
}

function doGet(e) {
  try {
    const payload = {ok:true, data:{
      schools:read_('Schools'), teams:read_('Teams'), events:read_('Events'),
      venues:read_('Venues'), matches:read_('Matches')
    }, timestamp:new Date().toISOString()};
    const callback = e && e.parameter ? (e.parameter.callback || '') : '';
    if (callback) {
      if (!/^naklang_cb_[A-Za-z0-9_]{1,80}$/.test(callback)) throw new Error('callback ไม่ถูกต้อง');
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return response_(payload);
  } catch (error) {
    return response_({ok:false,error:String(error.message || error)});
  }
}

function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('ไม่มีข้อมูลคำสั่ง');
    const request = JSON.parse(e.postData.contents);
    if (!authorized_(String(request.password || ''))) throw new Error('รหัสผ่านผู้ดูแลไม่ถูกต้อง');
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let changed;
    if (request.action === 'upsertTeam') changed = upsertTeam_(request.data);
    else if (request.action === 'upsertMatch') changed = upsertMatch_(request.data);
    else if (request.action === 'scoreMatch') changed = scoreMatch_(request.data);
    else if (request.action === 'deleteMatch') changed = deleteMatch_(request.data);
    else throw new Error('คำสั่งไม่รองรับ');
    SpreadsheetApp.flush();
    return response_({ok:true, changed:changed});
  } catch (error) {
    return response_({ok:false,error:String(error.message || error)});
  } finally {
    if (lock) try { lock.releaseLock(); } catch (ignored) {}
  }
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('กรุณารัน setupSheets() ก่อน');
  return SpreadsheetApp.openById(id);
}
function read_(name) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('ไม่พบชีต ' + name + ' (รัน setupSheets)');
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  return values.slice(1).filter(function(row) { return row[0] !== ''; }).map(function(row) {
    const obj = {};
    DB[name].forEach(function(key, i) { obj[key] = String(row[i] || ''); });
    return obj;
  });
}
function clean_(value, max) {
  const x = String(value == null ? '' : value).trim().slice(0, max || 120);
  return /^[=+@]/.test(x) ? "'" + x : x;
}
function safeRow_(name, obj) {
  return DB[name].map(function(k) { return clean_(obj[k], 250); });
}
function append_(name, obj) {
  spreadsheet_().getSheetByName(name).appendRow(safeRow_(name, obj));
}
function upsert_(name, obj) {
  const sheet = spreadsheet_().getSheetByName(name);
  const rows = read_(name);
  const idx = rows.findIndex(function(x) { return x.id === obj.id; });
  const row = safeRow_(name, obj);
  if (idx < 0) sheet.appendRow(row);
  else sheet.getRange(idx + 2, 1, 1, row.length).setValues([row]);
}
function requireOne_(value, accepted, label) {
  if (accepted.indexOf(value) < 0) throw new Error(label + ' ไม่ถูกต้อง');
}
function upsertTeam_(data) {
  data = data || {};
  const teams = read_('Teams');
  const schools = read_('Schools');
  const name = clean_(data.name, 100);
  const division = clean_(data.division, 30);
  const gender = clean_(data.gender, 10);
  const schoolId = clean_(data.school_id, 30);
  if (!name || name.length < 2) throw new Error('กรุณากรอกชื่อทีม');
  requireOne_(division, ['อนุบาล','ประถมต้น','ประถมปลาย','มัธยมต้น'], 'รุ่น');
  requireOne_(gender, ['ชาย','หญิง'], 'ประเภท');
  if (schoolId && !schools.some(function(s) { return s.id === schoolId; })) throw new Error('ไม่พบโรงเรียน');
  const id = clean_(data.id, 35) || ('T-' + Utilities.getUuid().slice(0,8));
  if (!/^[A-Za-z0-9_-]{2,35}$/.test(id)) throw new Error('รหัสทีมไม่ถูกต้อง');
  const found = teams.find(function(t) { return t.id === id; });
  upsert_('Teams',{id:id,school_id:schoolId,name:name,division:division,gender:gender});
  return {id:id,created:!found};
}
function minutes_(hhmm) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) throw new Error('เวลาต้องอยู่ในรูปแบบ HH:MM');
  const a = hhmm.split(':');
  return Number(a[0])*60 + Number(a[1]);
}
function overlaps_(aStart,aEnd,bStart,bEnd,margin) {
  margin = margin || 0;
  return aStart < bEnd + margin && bStart < aEnd + margin;
}
function upsertMatch_(data) {
  data = data || {};
  const matches = read_('Matches');
  const events = read_('Events');
  const venues = read_('Venues');
  const teams = read_('Teams');
  const id = clean_(data.id, 35);
  if (!/^[A-Za-z0-9_-]{2,35}$/.test(id)) throw new Error('รหัสคู่ต้องเป็นตัวเลข/อังกฤษ และขีดกลาง');
  const date = clean_(data.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00Z').getTime())) throw new Error('วันที่ไม่ถูกต้อง');
  const start = clean_(data.start, 5);
  const end = clean_(data.end, 5);
  const begin = minutes_(start);
  const finish = minutes_(end);
  if (finish <= begin) throw new Error('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
  const event = events.find(function(x) { return x.id === data.event_id; });
  const venue = venues.find(function(x) { return x.id === data.venue_id; });
  if (!event || !venue) throw new Error('ไม่พบรายการหรือสนาม');
  if (event.sport !== venue.sport) throw new Error('สนามไม่ตรงชนิดกีฬา');
  const homeId = clean_(data.home_id, 35);
  const awayId = clean_(data.away_id, 35);
  const homeLabel = clean_(data.home_label, 90);
  const awayLabel = clean_(data.away_label, 90);
  if ((!homeId && !homeLabel) || (!awayId && !awayLabel)) throw new Error('ต้องกำหนดทีม หรือคำอธิบายทีมรอผลทั้งสองฝั่ง');
  if (homeId && homeId === awayId) throw new Error('ทีม A และ B ต้องไม่ซ้ำกัน');
  [homeId,awayId].filter(Boolean).forEach(function(teamId) {
    const t = teams.find(function(x) { return x.id === teamId; });
    if (!t) throw new Error('ไม่พบรหัสทีม ' + teamId);
    if (t.division !== event.division || t.gender !== event.gender) throw new Error('รุ่น/ประเภทของทีมไม่ตรงรายการ');
  });
  const stage = clean_(data.stage, 40) || 'รอบแบ่งกลุ่ม';
  const status = clean_(data.status, 15) || 'scheduled';
  requireOne_(status,['scheduled','live','finished'],'สถานะ');
  const previous = matches.find(function(x) { return x.id === id; });
  matches.forEach(function(m) {
    if (m.id === id || m.date !== date) return;
    const mEvent = events.find(function(x) { return x.id === m.event_id; });
    const otherStart = minutes_(m.start), otherEnd = minutes_(m.end);
    if (!overlaps_(begin,finish,otherStart,otherEnd,0) &&
        !(mEvent && ['ฟุตบอล','วอลเลย์บอล'].indexOf(mEvent.sport)>=0 &&
          ['ฟุตบอล','วอลเลย์บอล'].indexOf(event.sport)>=0 &&
          event.division===mEvent.division && event.gender===mEvent.gender &&
          overlaps_(begin,finish,otherStart,otherEnd,15))) return;
    if (venue.id === m.venue_id && overlaps_(begin,finish,otherStart,otherEnd,0)) {
      throw new Error('สนาม ' + venue.name + ' ชนกับคู่ ' + m.id);
    }
    if (homeId && [m.home_id,m.away_id].indexOf(homeId)>=0 && overlaps_(begin,finish,otherStart,otherEnd,0)) throw new Error('ทีม A แข่งขันพร้อมคู่ ' + m.id);
    if (awayId && [m.home_id,m.away_id].indexOf(awayId)>=0 && overlaps_(begin,finish,otherStart,otherEnd,0)) throw new Error('ทีม B แข่งขันพร้อมคู่ ' + m.id);
    if (mEvent && ['ฟุตบอล','วอลเลย์บอล'].indexOf(mEvent.sport)>=0 &&
        ['ฟุตบอล','วอลเลย์บอล'].indexOf(event.sport)>=0 &&
        event.division===mEvent.division && event.gender===mEvent.gender &&
        overlaps_(begin,finish,otherStart,otherEnd,15)) {
      throw new Error('คิวฟุตบอล/วอลเลย์บอลรุ่นและประเภทเดียวกันชนกับ ' + m.id + ' (ต้องเว้น 15 นาที)');
    }
  });
  const item = {
    id:id,date:date,start:start,end:end,event_id:event.id,venue_id:venue.id,
    group:clean_(data.group,12),stage:stage,home_id:homeId,away_id:awayId,
    home_label:homeLabel,away_label:awayLabel,
    home_score:previous ? previous.home_score : '',away_score:previous ? previous.away_score : '',
    status:previous ? previous.status : status,updated_at:new Date().toISOString()
  };
  upsert_('Matches',item);
  return {id:id,created:!previous};
}
function scoreMatch_(data) {
  data=data || {};
  const match = read_('Matches').find(function(x) { return x.id === data.id; });
  if (!match) throw new Error('ไม่พบคู่แข่งขัน');
  const status = clean_(data.status,15);
  requireOne_(status,['scheduled','live','finished'],'สถานะ');
  let h = '', a = '';
  if (status !== 'scheduled') {
    h = Number(data.home_score);
    a = Number(data.away_score);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 999 || a > 999) throw new Error('คะแนนต้องเป็นจำนวนเต็ม 0–999');
  }
  match.home_score = status === 'scheduled' ? '' : String(h);
  match.away_score = status === 'scheduled' ? '' : String(a);
  match.status = status;
  match.updated_at = new Date().toISOString();
  upsert_('Matches', match);
  return {id:match.id,status:status};
}
function deleteMatch_(data) {
  const id = clean_(data && data.id,35);
  const sheet = spreadsheet_().getSheetByName('Matches');
  const rows = read_('Matches');
  const idx = rows.findIndex(function(x) { return x.id === id; });
  if (idx < 0) throw new Error('ไม่พบคู่แข่งขัน');
  sheet.deleteRow(idx+2);
  return {id:id,deleted:true};
}
function authorized_(password) {
  const props = PropertiesService.getScriptProperties();
  const salt=props.getProperty('ADMIN_SALT'), expected=props.getProperty('ADMIN_HASH');
  if (!salt || !expected || !password) return false;
  const actual = sha256_(salt + password);
  if (actual.length !== expected.length) return false;
  let diff=0;
  for (let i=0; i<actual.length; i++) diff |= actual.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
function sha256_(txt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ('0' + (b<0 ? b+256 : b).toString(16)).slice(-2); }).join('');
}
function response_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
