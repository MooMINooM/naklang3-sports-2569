import {showSimulationNotice} from './simulation-notice.js?v=20261124-score-test';
import {schoolNameMarkup} from './school-label.js?v=20261123-wide-groups';
import {sportTeamNumbers} from './supabase/functions/naklang3-sports/team-numbering.js?v=20261123-combined';
import {filterResultMatches, resultCards, resultState, nextUnscored} from './admin-results.js?v=20261124-results-ui';
import {readSports, saveMatch, saveDraw, saveTeamNumbers, saveMiddleSchools, randomizeGroups} from './sports-api.js?v=20261124-middle-schools';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, options, blank, usesSets, setResult,
} from './sports-data.js?v=20261123-supabase';

const byId = id => document.getElementById(id);
const login = byId('login-form');
const loginPanel = byId('login-panel');
const workspace = byId('workspace');
const list = byId('matches');
const dialog = byId('match-dialog');
const form = byId('match-form');
const fields = form.elements;
const dayFilter = byId('day-filter');
const sportFilter = byId('sport-filter');
const roundFilter = byId('round-filter');
const levelFilter = byId('level-filter');
const typeFilter = byId('type-filter');
const drawDialog = byId('draw-dialog');
const drawForm = byId('draw-form');
const drawFields = drawForm.elements;
const numbersPanel = byId('team-numbers-panel');
const numbersForm = byId('team-numbers-form');
const teamNumbers = Array.from({length: 10}, (_, i) => String(i + 1));
const managedFields = ['sport', 'level', 'type', 'stage', 'group'];
const publishedFilter = byId('published-filter');
const scoreStatusFilter = byId('score-status-filter');
const matchSearch = byId('match-search');
let workspaceView = 'results';
let draftAtOpen = '';
let lastSavedId = '';
let toastTimer;
let data = blank;
let key = '';
let editing = null;
let scoreOnly = false;
let busy = false;
let clearSets = false;
let numberRows = [];
let numberPrevious = {};
let numbersDirty = false;
let middleDirty = false;
const setGrid = byId('set-grid');
setGrid.innerHTML = '<div class="set-grid-head"><span>เซต</span><strong id="set-team-home">ทีมที่ 1</strong><strong id="set-team-away">ทีมที่ 2</strong></div>' + [1,2,3].map(set =>
  '<div class="set-row" data-set-row="'+set+'"><div class="set-label">เซต '+set+'<small id="set-state-'+set+'"></small></div>' +
  ['home','away'].map(side => '<input data-set type="number" inputmode="numeric" min="0" max="999" step="1" name="'+side+'Set'+set+'" aria-label="แต้มเซต '+set+' '+(side==='home'?'ทีมที่ 1':'ทีมที่ 2')+'">').join('')+'</div>').join('');
const setFields = [...setGrid.querySelectorAll('input')];

dayFilter.innerHTML = options(DAYS, '', 'ทุกวัน');
sportFilter.innerHTML = options(SPORTS, '', 'ทุกกีฬา');
levelFilter.innerHTML = options(LEVELS, '', 'ทุกรุ่น');
typeFilter.innerHTML = options(TYPES, '', 'ทุกประเภท');

function status(id, message, error = false) {
  const target = byId(id);
  target.textContent = message;
  target.dataset.error = String(error);
  if(id==='workspace-status'){
    clearTimeout(toastTimer);
    if(message&&!error&&!message.startsWith('กำลัง')) toastTimer=setTimeout(()=>{if(target.textContent===message)target.textContent='';},6000);
  }
}

function render() {
  loginPanel.hidden = Boolean(key);
  workspace.hidden = !key;
  if (!key) return;
  showSimulationNotice(data, document.querySelector('#workspace .workspace-header'));
  if (!numbersDirty) renderTeamNumbers();
  if (!middleDirty) renderMiddleSchools();
  const drawInfo = data.groupDraw;
  byId('group-draw-summary').textContent = drawInfo ? 'สุ่มสายแล้ว ' + drawInfo.events + ' รายการ · คู่โรงเรียนร่วมสายหลากหลาย ' + drawInfo.before.distinctPairs + ' → ' + drawInfo.after.distinctPairs + '/' + drawInfo.after.possiblePairs + ' คู่ · คู่เดิมร่วมสายสูงสุด ' + drawInfo.after.maxPairMeetings + ' รายการ · รหัส ' + drawInfo.seed : 'ยังไม่ได้สุ่มกระจายสาย';

  byId('open-team-numbers').disabled = data.formatVersion < 4 || !data.teamNumbers;
  byId('open-draw').disabled = !data.draws?.some(draw => draw.level !== 'middle');
  const publishedCount = data.matches.filter(match => match.published).length;
  byId('summary').textContent = data.matches.length + ' คู่ · เผยแพร่แล้ว ' + publishedCount + ' คู่';
  byId('settings-view').hidden = workspaceView !== 'settings';
  byId('results-view').hidden = workspaceView === 'settings';
  byId('results-overview').hidden = workspaceView === 'settings';
  document.querySelectorAll('[data-workspace]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.workspace === workspaceView)));
  document.querySelectorAll('[data-sport-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sportFilter === sportFilter.value)));
  const base = filterResultMatches(data, {...activeFilters(), status: ''});
  for (const state of ['pending','completed','waiting']) byId('metric-'+state).textContent = base.filter(m => resultState(m) === state).length;
  byId('metric-total').textContent = base.length;
  document.querySelectorAll('[data-status-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.statusFilter === scoreStatusFilter.value)));
  const matches = visibleMatches();
  byId('list-summary').textContent = 'แสดง '+matches.length+' คู่'+(scoreStatusFilter.value ? ' · '+({pending:'พร้อมบันทึกผล',completed:'บันทึกผลแล้ว',waiting:'รอระบุคู่แข่งขัน'})[scoreStatusFilter.value] : '');
  list.innerHTML = resultCards(matches, data);
  if (lastSavedId) list.querySelector('[data-match-id="'+CSS.escape(lastSavedId)+'"]')?.classList.add('just-saved');
}
function activeFilters() {
  return {day:dayFilter.value,sport:sportFilter.value,level:levelFilter.value,type:typeFilter.value,round:roundFilter.value,published:publishedFilter.value,status:scoreStatusFilter.value,query:matchSearch.value};
}
function visibleMatches() { return filterResultMatches(data,activeFilters()); }
function selectWorkspace(view) {
  workspaceView=view;
  if(view==='knockout') {roundFilter.value='knockout';dayFilter.value='';scoreStatusFilter.value='';}
  else if(view==='results' && roundFilter.value==='knockout') roundFilter.value='';
  render();
}
function resetFilters() {
  for (const field of [dayFilter,sportFilter,levelFilter,typeFilter,roundFilter,publishedFilter,scoreStatusFilter]) field.value='';
  matchSearch.value='';workspaceView='results';render();

}

function endSession(message = '') {
  key = '';
  numbersDirty = middleDirty = false;
  workspaceView = 'results';
  data = blank;
  list.replaceChildren();
  login.reset();
  status('login-status', message, Boolean(message));
  render();
  byId('key').focus();
}

async function refresh() {
  if (busy || !key) return;
  const activeKey = key;
  try {
    const latest = await readSports(activeKey);
    if (key !== activeKey) return;
    if (!latest.canEdit) {
      endSession('เซสชันผู้จัดสิ้นสุด กรุณาเข้าสู่ระบบอีกครั้ง');
      return;
    }
    data = latest;
    status('workspace-status', 'โหลดข้อมูลล่าสุดแล้ว');
    render();
  } catch (error) {
    if (key === activeKey) status('workspace-status', error.message, true);
  }
}

function edit(match, resultsOnly = false) {
  if (busy) return;
  editing = match || null;
  scoreOnly = Boolean(match && resultsOnly);
  byId('match-details').hidden = byId('match-details').disabled = scoreOnly;
  byId('match-context').hidden = !scoreOnly;
  byId('publish-match').hidden = scoreOnly;
  fields.published.disabled = scoreOnly;
  byId('save-match').textContent = scoreOnly ? 'บันทึกผล' : 'บันทึกคู่แข่งขัน';
  byId('save-match').disabled = scoreOnly && match.ready === false;
  byId('assign-from-score').hidden = !scoreOnly || match.ready !== false ||
    !['group', 'league'].includes(match.stage);
  if (scoreOnly) {
    byId('match-context-teams').innerHTML = '<div class="score-team home">'+schoolNameMarkup(match.home,data.schoolLogos)+'<small>ทีมที่ 1</small></div><span class="score-versus">พบ</span><div class="score-team away">'+schoolNameMarkup(match.away,data.schoolLogos)+'<small>ทีมที่ 2</small></div>';
    byId('match-context-details').textContent = [
      SPORTS[match.sport], LEVELS[match.level] + TYPES[match.type], STAGES[match.stage],
      DAYS[match.day] + ' ' + match.start + ' น.', fieldName(data.fields,match.field), match.id,
    ].join(' · ');
  }
  const day = match?.day || Number(dayFilter.value) || 1;
  form.reset();
  clearSets = false;
  setFields.forEach((field, i) => { field.value = match?.scoreSets?.[Math.floor(i / 2)]?.[i % 2] ?? ''; });
  byId('form-title').textContent = scoreOnly ? 'บันทึกผล' + ' ' + SPORTS[match.sport] : match ? 'แก้ไขคู่แข่งขัน' : 'เพิ่มคู่แข่งขัน';
  fields.day.innerHTML = options(DAYS, day);
  fields.sport.innerHTML = options(SPORTS, match?.sport || sportFilter.value || 'football');
  fields.level.innerHTML = options(LEVELS, match?.level || 'upper');
  fields.type.innerHTML = options(TYPES, match?.type || 'boys');
  fields.start.value = match?.start || (day === 1 ? data.settings.minDay1 : data.settings.minOther);
  for (const field of ['home', 'away', 'homeScore', 'awayScore']) fields[field].value = match?.[field] ?? '';
  fields.home.readOnly = fields.away.readOnly = Boolean(match?.managed);
  for (const name of managedFields) fields[name].disabled = Boolean(match?.managed);
  fields.homeScore.disabled = fields.awayScore.disabled = match?.ready === false;
  fields.group.value = match?.group || 'A';
  fields.published.checked = match?.published || false;
  byId('schools').innerHTML = data.schools.map(school => '<option value="' + esc(school) + '"></option>').join('');
  syncMatchChoices(match?.stage, match?.field);
  updateScoreHint(match?.tieWinner || '');
  status('form-status', '');
  dialog.dataset.mode = scoreOnly ? 'score' : 'schedule';
  dialog.showModal();
  draftAtOpen = scoreDraftSignature();
  const focus = scoreOnly ? usesSets(match.sport) ? setFields.find(field => !field.disabled) : fields.homeScore : fields.start;
  if (!focus?.disabled) focus?.focus({preventScroll:true});
}

function syncMatchChoices(stage = fields.stage.value, field = fields.field.value) {
  const [sport, level, type, day, start] = ['sport', 'level', 'type', 'day', 'start'].map(name => fields[name].value);
  const stages = level === 'middle' ? {league: STAGES.league} : Object.fromEntries(
    Object.entries(STAGES).filter(([id]) => id !== 'league'));
  fields.stage.innerHTML = options(stages, stage);
  byId('group-field').hidden = fields.stage.value !== 'group';

  const available = data.fields.filter(venue => {
    const rule = data.settings.fieldConversions?.[venue.id] || {day: data.settings.convertDay, time: data.settings.convertTime};
    const convertDay = rule.day, convertTime = rule.time;
    const converted = Number(day) > Number(convertDay) || (Number(day) === Number(convertDay) && start >= convertTime);
    const levels = ['F2', 'F3'].includes(venue.id) && convertDay && convertTime && converted
      ? ['upper', 'middle'] : venue.levels.split(',');
    return venue.sport === sport && levels.includes(level) && (!venue.type || venue.type === type);
  });
  fields.field.innerHTML = options(Object.fromEntries(available.map(venue => [venue.id, venue.name])), field, 'เลือกสนาม');
}

login.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const input = new FormData(login).get('key');
  const button = login.querySelector('button');
  button.disabled = busy = true;
  status('login-status', 'กำลังตรวจรหัส…');
  try {
    const result = await readSports(input);
    if (!result.canEdit) throw new Error('รหัสผู้จัดไม่ถูกต้อง');
    key = input;
    data = result;
    login.reset();
    status('login-status', '');
    status('workspace-status', '');
    render();
    matchSearch.focus();
  } catch (error) {
    status('login-status', error.message, true);
  } finally {
    button.disabled = busy = false;
  }
});

byId('clear-result').addEventListener('click', () => {
  setFields.forEach(field => field.value='');fields.homeScore.value=fields.awayScore.value='';fields.tieWinner.value='';clearSets=true;updateScoreHint();
});
form.addEventListener('click', event => {
  const button=event.target.closest('[data-score-step]');if(!button||busy||editing?.ready===false)return;
  const [name,step]=button.dataset.scoreStep.split(':');fields[name].value=Math.max(0,Math.min(999,Number(fields[name].value||0)+Number(step)));updateScoreHint();
});
form.addEventListener('input',event=>{if(['homeScore','awayScore'].includes(event.target.name))updateScoreHint();});
form.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.ctrlKey||event.metaKey||!scoreOnly||event.target.tagName!=='INPUT')return;
  event.preventDefault();const inputs=usesSets(fields.sport.value)?setFields.filter(field=>!field.disabled):[fields.homeScore,fields.awayScore];
  (inputs[inputs.indexOf(event.target)+1]||byId('save-match')).focus();
});
setGrid.addEventListener('input', () => updateScoreHint());
form.addEventListener('change', event => {
  if (['sport', 'level', 'type', 'stage', 'day', 'start'].includes(event.target.name)) syncMatchChoices();
  updateScoreHint();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !key || (scoreOnly && editing.ready === false)) return;
  if(scoreOnly&&!validScoreDraft()){updateScoreHint();return;}
  const continueNext=event.submitter?.id==='save-next';
  const values=new FormData(form);
  const match=Object.fromEntries(values);
  if (scoreOnly) {
    for (const field of ['day', 'start', 'sport', 'level', 'type', 'stage', 'group', 'field', 'home', 'away']) {
      match[field] = editing[field];
    }
  }
  match.id = editing?.id || '';
  if (editing?.managed) {
    for (const name of managedFields) match[name] = editing[name];
    match.home = editing.rawHome;
    match.away = editing.rawAway;
  }
  match.day = Number(match.day);
  match.home = match.home.trim();
  match.away = match.away.trim();
  match.group = match.stage === 'group' ? match.group : '';
  match.published = scoreOnly ? editing.published : values.has('published');
  for (const field of ['homeScore', 'awayScore']) match[field] = match[field] ? Number(match[field]) : '';

  if (editing && !scoreOnly) {
    match.homeScore = editing.homeScore;
    match.awayScore = editing.awayScore;
    match.tieWinner = editing.tieWinner;
  } else if (usesSets(match.sport)) {
    if (data.formatVersion < 5) {
      status('form-status', 'กรุณาโหลดหน้าใหม่หลังระบบเปิดบันทึกแต้มรายเซต', true);
      return;
    }
    try {
      const sets = enteredSets();
      if (sets.length && !setResult(sets).finished) throw new Error('กรอกผลจนทีมหนึ่งชนะครบ 2 เซต');
      if (sets.length || clearSets || editing?.scoreSets?.length) match.scoreSets = sets;
      else if (editing && editing.sport === match.sport) {
        match.homeScore = editing.homeScore;
        match.awayScore = editing.awayScore;
      }
    } catch (error) {
      status('form-status', error.message, true);
      return;
    }
  }

  const save = byId('save-match');
  const cancel = byId('cancel-match');
  busy=save.disabled=cancel.disabled=byId('save-next').disabled=byId('close-match').disabled=true;
  form.inert=true;form.setAttribute('aria-busy','true');
  status('form-status', 'กำลังบันทึกผลการแข่งขัน…');
  try {
    await saveMatch(key, match);
    data = await readSports(key);
    const wasScoreOnly=scoreOnly;lastSavedId=match.id;dialog.close();render();
    const next=continueNext?nextUnscored(filterResultMatches(data,{...activeFilters(),status:''}),match.id):null;
    status('workspace-status',wasScoreOnly?'บันทึกผล '+match.id+' แล้ว · หน้าผู้ชมและทีมเข้ารอบอัปเดตอัตโนมัติ'+(continueNext&&!next?' · ครบทุกคู่ที่พร้อมลงผลในรายการที่เลือกแล้ว':''):'บันทึกคู่แข่งขันแล้ว');
    busy=false;form.inert=false;form.removeAttribute('aria-busy');if(next)edit(next,true);else byId('workspace-status').focus({preventScroll:true});
  } catch (error) {
    status('form-status', error.message, true);
  } finally {
    busy=cancel.disabled=byId('close-match').disabled=false;form.inert=false;form.removeAttribute('aria-busy');updateSaveAvailability();
  }
});
function scoreDraftSignature(){return JSON.stringify([...new FormData(form)])+String(clearSets);}
function allowClose(){return !busy&&(scoreDraftSignature()===draftAtOpen||window.confirm('ยังไม่ได้บันทึกการแก้ไข ต้องการปิดหน้านี้หรือไม่?'));}
dialog.addEventListener('cancel',event=>{if(!allowClose())event.preventDefault();});
for(const id of ['cancel-match','close-match'])byId(id).addEventListener('click',()=>{if(allowClose())dialog.close();});
byId('logout').addEventListener('click', () => { if (!busy) endSession(); });
byId('refresh').addEventListener('click', refresh);
byId('open-knockout').addEventListener('click',()=>{if(!busy)selectWorkspace('knockout');});
document.querySelectorAll('[data-workspace]:not(#open-knockout)').forEach(button=>button.addEventListener('click',()=>{if(!busy)selectWorkspace(button.dataset.workspace);}));
document.querySelectorAll('[data-status-filter]').forEach(button=>button.addEventListener('click',()=>{scoreStatusFilter.value=button.dataset.statusFilter;workspaceView='results';render();}));
document.querySelectorAll('[data-sport-filter]').forEach(button=>button.addEventListener('click',()=>{sportFilter.value=button.dataset.sportFilter;render();}));
byId('reset-filters').addEventListener('click',resetFilters);matchSearch.addEventListener('input',render);
byId('new-match').addEventListener('click', () => edit());
for (const filter of [dayFilter, sportFilter, publishedFilter, roundFilter, levelFilter, typeFilter, scoreStatusFilter]) filter.addEventListener('change', render);
list.addEventListener('click', event => {
  if(event.target.closest('[data-reset-filters]')){resetFilters();return;}
  const resolver=event.target.closest('[data-resolve-tie], [data-assign-school]');
  if(resolver){
    const row=data.matches.find(m=>m.id===(resolver.dataset.resolveTie||resolver.dataset.assignSchool));
    if(!row||busy)return;
    if(resolver.dataset.resolveTie){byId('open-draw').click();drawFields.event.value=[row.sport,row.level,row.type].join(':');renderDraw();}
    else{selectWorkspace('settings');(row.level==='middle'?byId('middle-schools-form'):numbersPanel).scrollIntoView({behavior:'smooth',block:'start'});}
    return;
  }
  const action = event.target.closest('[data-edit], [data-score]');
  const id = action?.dataset.score || action?.dataset.edit;
  const match = id && data.matches.find(row => row.id === id);
  if (match) edit(match, Boolean(action.dataset.score));
});
byId('assign-from-score').addEventListener('click', () => {
  dialog.close();
  byId('open-team-numbers').click();
});

function enteredSets() {
  const sets = [];
  for (let i = 0; i < setFields.length; i += 2) {
    const pair = setFields.slice(i, i + 2).map(field => field.value);
    if (pair.every(score => score === '')) continue;
    if (sets.length !== i / 2 || pair.some(score => score === '')) throw new Error('กรอกแต้มทั้งสองทีมตามลำดับเซต');
    sets.push(pair.map(Number));
  }
  return sets;
}

function syncThirdSet() {
  const first=setFields.slice(0,4).map(field=>field.value);
  let split=false,finished=false;
  if(first.every(value=>value!=='')) {
    try {const r=setResult([[Number(first[0]),Number(first[1])],[Number(first[2]),Number(first[3])]]);finished=r.finished;split=!finished;}
    catch {}
  }
  if(finished) setFields.slice(4).forEach(field=>field.value='');
  setFields.slice(4).forEach(field=>field.disabled=editing?.ready===false || !split);
  setGrid.querySelector('[data-set-row="3"]').classList.toggle('is-disabled',!split);
  byId('set-state-3').textContent=finished?'จบใน 2 เซต':split?'เซตตัดสิน':'กรอกเซต 1–2 ก่อน';
}
function validScoreDraft() {
  if(editing?.ready===false)return false;
  if(usesSets(fields.sport.value)) {
    try {const sets=enteredSets();return sets.length?setResult(sets).finished:Boolean(clearSets&&editing&&hasScore(editing))||Boolean(editing&&hasScore(editing)&&!editing.scoreSets?.length&&!clearSets);}catch{return false;}
  }
  const values=[fields.homeScore.value,fields.awayScore.value];
  if(values.every(value=>value===''))return Boolean(clearSets&&editing&&hasScore(editing));
  if(values.some(value=>value==='')||values.some(value=>!Number.isInteger(Number(value))||Number(value)<0||Number(value)>999))return false;
  return !(Number(values[0])===Number(values[1])&&['semi','third','final'].includes(fields.stage.value))||['home','away'].includes(fields.tieWinner.value);
}
function updateSaveAvailability() {
  const valid=!scoreOnly||validScoreDraft();
  byId('save-match').disabled=busy||!valid;
  byId('save-next').hidden=!scoreOnly;
  byId('save-next').disabled=busy||!valid;
}
function updateScoreHint(tieWinner=fields.tieWinner.value) {
  const setSport=usesSets(fields.sport.value),unresolved=editing?.ready===false;
  const names=[fields.home.value||'ทีมที่ 1',fields.away.value||'ทีมที่ 2'];
  const preview=byId('score-preview');
  if(editing&&!scoreOnly) {
    byId('single-scores').hidden=byId('set-scores').hidden=byId('tie-field').hidden=true;
    fields.homeScore.disabled=fields.awayScore.disabled=byId('set-scores').disabled=fields.tieWinner.disabled=true;
    fields.tieWinner.required=false;preview.hidden=true;byId('clear-result').hidden=true;status('score-hint','');updateSaveAvailability();return;
  }
  preview.hidden=false;byId('clear-result').hidden=!editing||!hasScore(editing);
  const unit=fields.sport.value==='football'?'ประตู':'แต้ม';
  document.querySelector('#single-home span').textContent=unit+'ทีมที่ 1';document.querySelector('#single-away span').textContent=unit+'ทีมที่ 2';
  fields.homeScore.setAttribute('aria-label',unit+' '+names[0]);fields.awayScore.setAttribute('aria-label',unit+' '+names[1]);
  byId('single-scores').hidden=setSport;fields.homeScore.disabled=fields.awayScore.disabled=setSport||unresolved;
  byId('set-scores').hidden=!setSport;byId('set-scores').disabled=unresolved;
  document.querySelectorAll('[data-score-step]').forEach(button=>button.disabled=unresolved||busy);
  let message='',error=false,title='ผลที่จะเผยแพร่',score='–',detail='กรอกคะแนนเพื่อดูสรุปผล',winner='';
  if(unresolved){message=['group','league'].includes(fields.stage.value)?'กำหนดโรงเรียนให้ครบก่อนกรอกผล':'รอผลรอบก่อนหน้าเพื่อยืนยันคู่แข่งขัน';detail=message;}
  if(setSport) {
    byId('tie-field').hidden=fields.tieWinner.disabled=true;fields.tieWinner.required=false;
    byId('set-team-home').textContent='ทีมที่ 1';byId('set-team-away').textContent='ทีมที่ 2';
    setFields.forEach((field,i)=>field.setAttribute('aria-label','แต้มเซต '+(Math.floor(i/2)+1)+' '+names[i%2]));syncThirdSet();
    try {
      const sets=enteredSets(),result=setResult(sets),legacy=editing&&hasScore(editing)&&!editing.scoreSets?.length&&!clearSets;
      if(!unresolved&&sets.length){score=result.wins.join(' – ');title='ผลรวมเซต';detail='แต้มรวม '+result.points.join(' – ');if(result.finished)winner=names[result.wins[0]===2?0:1];else message='กรอกผลให้ครบจนทีมหนึ่งชนะ 2 เซต';}
      else if(!unresolved&&legacy){score=editing.homeScore+' – '+editing.awayScore;detail='ผลเดิมยังไม่มีแต้มรายเซต';}
      else if(!unresolved&&clearSets){message='ผลคู่นี้จะถูกล้างเมื่อกดบันทึก';detail='เตรียมล้างผลการแข่งขัน';}
      else if(!unresolved)message='กรอกแต้มทั้งสองทีมในแต่ละเซต';
    }catch(failure){message=failure.message;error=true;detail='กรอกแต้มให้ครบตามลำดับเซต';}
  }else{
    const h=fields.homeScore.value,a=fields.awayScore.value,complete=h!==''&&a!=='';
    const tied=complete&&Number(h)===Number(a),needsWinner=tied&&['semi','third','final'].includes(fields.stage.value)&&!unresolved;
    fields.tieWinner.innerHTML=options({home:names[0],away:names[1]},tieWinner,'เลือกโรงเรียนผู้ชนะ');
    fields.tieWinner.disabled=!needsWinner;fields.tieWinner.required=needsWinner;byId('tie-field').hidden=!needsWinner;
    if(!unresolved&&complete){
      if([h,a].some(x=>!Number.isInteger(Number(x))||Number(x)<0||Number(x)>999)){message='กรอกคะแนนเป็นจำนวนเต็ม 0–999';error=true;}
      else{score=h+' – '+a;detail=unit;if(needsWinner){winner=fields.tieWinner.value?names[fields.tieWinner.value==='home'?0:1]:'';message=winner?'ผู้ชนะตามผลการตัดสิน':'เลือกผู้ชนะตามผลการตัดสินก่อนบันทึก';}else if(tied)detail='เสมอ';else winner=Number(h)>Number(a)?names[0]:names[1];}
    }else if(!unresolved)message=clearSets?'ผลคู่นี้จะถูกล้างเมื่อกดบันทึก':'กรอก'+unit+'ให้ครบทั้งสองทีม';
  }
  preview.dataset.complete=String(Boolean(winner||detail==='เสมอ'));
  preview.innerHTML='<span class="preview-title">'+esc(title)+'</span><strong class="preview-score">'+esc(score)+'</strong><span>'+esc(detail)+'</span>'+(winner?'<strong class="preview-winner">ผู้ชนะ · '+esc(winner)+'</strong>':'');
  status('score-hint',message,error);updateSaveAvailability();
}

function drawOptions() {
  return Object.fromEntries((data.draws || []).filter(draw => draw.level !== 'middle').map(draw => [
    draw.key, SPORTS[draw.sport] + ' · ' + LEVELS[draw.level] + TYPES[draw.type],
  ]));
}

function renderDraw() {
  const draw = data.draws.find(item => item.key === drawFields.event.value);
  if (!draw) return;
  const numbered = Object.keys(draw.numbers || {}).length > 0;
  drawFields.tieOrder.placeholder = numbered ? '1, 5, 9' : 'A1, B2, C1';
  drawFields.tieOrder.value = numbered
    ? draw.tieOrder.split(',').map(slot => draw.numbers[slot]).filter(Boolean).join(', ')
    : draw.tieOrder;
  byId('draw-tie-help').textContent = numbered
    ? 'ใส่เลขทีมตามที่เห็นในตารางแข่ง จากอันดับสูงไปต่ำตามผลตัดสินของกรรมการ'
    : 'ใส่รหัสทีมจากอันดับสูงไปต่ำตามผลตัดสินของกรรมการ';

  status('draw-status', '');
}

byId('open-draw').addEventListener('click', () => {
  if (busy || !data.draws?.length) return;
  drawFields.event.innerHTML = options(drawOptions(), drawFields.event.value);
  renderDraw();
  drawDialog.showModal();
});
drawFields.event.addEventListener('change', renderDraw);
byId('close-draw').addEventListener('click', () => { if (!busy) drawDialog.close(); });
drawDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
drawForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !key) return;
  const draw = data.draws.find(item => item.key === drawFields.event.value);
  if (!draw) return;
  let tieOrder = drawFields.tieOrder.value;
  if (Object.keys(draw.numbers || {}).length) {
    const slotsByNumber = new Map(Object.entries(draw.numbers).map(([slot, number]) => [number, slot]));
    const slots = tieOrder.trim().split(/[\s,]+/).filter(Boolean).map(number => slotsByNumber.get(number));
    if (slots.some(slot => !slot) || new Set(slots).size !== slots.length) {
      status('draw-status', 'ใส่เฉพาะเลขทีมที่อยู่ในรายการนี้และเรียงโดยไม่ซ้ำกัน', true);
      return;
    }
    tieOrder = slots.join(',');
  }
  const save = byId('save-draw');
  busy = save.disabled = drawFields.event.disabled = true;
  status('draw-status', 'กำลังบันทึกลำดับ…');
  try {
    await saveDraw(key, {key: draw.key, tieOrder});
    data = await readSports(key);
    render();
    renderDraw();
    status('draw-status', 'บันทึกลำดับแล้ว');
  } catch (error) {
    status('draw-status', error.message, true);
  } finally {
    busy = save.disabled = drawFields.event.disabled = false;
  }
});

function renderTeamNumbers() {
  numberPrevious = Object.fromEntries(teamNumbers.map(number => [number, data.teamNumbers?.[number] || '']));
  numberRows = [...new Set([...data.schools, ...Object.values(numberPrevious).filter(Boolean)])];
  byId('number-schools').innerHTML = [...new Set(data.schools.concat('บ้านหนองด้วง–ซำขอนแก่น'))]
    .map(name => '<option value="' + esc(name) + '"></option>').join('');
  const rows = numberRows.map((name, index) => {
    const number = teamNumbers.find(number => numberPrevious[number] === name) || '';
    const logo = data.schoolLogos?.[name] || '';
    return '<tr><td><input name="school-' + index + '" aria-label="โรงเรียนแถวที่ ' + (index + 1) +
      '" maxlength="100" list="number-schools" value="' + esc(name) + '"></td><td><select name="number-' + index +
      '" aria-label="หมายเลขทีมของ ' + esc(name) + '">' + options(Object.fromEntries(teamNumbers.map(number =>
        [number, 'ทีม ' + number])), number, 'ยังไม่กำหนด') + '</select></td><td><div class="number-logo">' +
      '<span id="number-logo-' + index + '">' + (logo ? '<img src="' + esc(logo) +
        '" alt="" width="36" height="44">' : '') + '</span><input type="url" name="logo-' + index +
      '" aria-label="ลิงก์โลโก้ของ ' + esc(name) + '" maxlength="1500" placeholder="ลิงก์รูป HTTPS" value="' +
      esc(logo) + '"></div></td></tr>';
  });
  byId('team-number-fields').innerHTML = '<table class="number-table"><thead><tr><th scope="col">โรงเรียน</th>' +
    '<th scope="col">หมายเลขทีม</th><th scope="col">โลโก้โรงเรียน</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  byId('team-numbers-summary').textContent = 'กำหนดแล้ว ' + Object.values(numberPrevious).filter(Boolean).length + ' / 10 หมายเลข';
  renderSportNumbers();
  status('team-numbers-status', '');
}

function renderSportNumbers() {
  let teams = data.teamNumbers || {};
  if (numbersDirty) {
    try { teams = enteredTeamNumbers(new FormData(numbersForm)).teams; } catch { return; }
  }
  byId('sport-number-preview').innerHTML = ['football', 'takraw'].map(sport => {
    const entries = sportTeamNumbers(teams, sport);
    return '<section><h3>' + (sport === 'football' ? 'ฟุตบอล / วอลเลย์บอล' : 'ตะกร้อ / เปตอง') + '</h3><ol>' +
      entries.map(entry => '<li><strong>ทีม ' + esc(entry.number) + '</strong> ' + schoolNameMarkup(entry.school || 'รอกำหนดโรงเรียน', data.schoolLogos || {}) +
      (entry.sourceNumbers.join(',') !== entry.number ? ' <small>(เลขจับสลาก ' + esc(entry.sourceNumbers.join(', ')) + ')</small>' : '') + '</li>').join('') + '</ol></section>';
  }).join('');
}

byId('open-team-numbers').addEventListener('click', () => {
  if (busy || !data.teamNumbers) return;
  selectWorkspace('settings');
  numbersPanel.scrollIntoView({behavior: 'smooth', block: 'start'});
  numbersForm.querySelector('select')?.focus({preventScroll: true});
});
numbersForm.addEventListener('input', () => { numbersDirty = true; renderSportNumbers(); });
numbersForm.addEventListener('change', event => {
  if (!event.target.name.startsWith('school-')) return;
  const index = Number(event.target.name.slice(7));
  const logo = data.schoolLogos?.[event.target.value.trim()] || '';
  numbersForm.elements['logo-' + index].value = logo;
  byId('number-logo-' + index).innerHTML = logo ? '<img src="' + esc(logo) + '" alt="" width="36" height="44">' : '';
});

function enteredTeamNumbers(values) {
  const teams = Object.fromEntries(teamNumbers.map(number => [number, '']));
  const logos = {};
  const names = new Set();
  for (let index = 0; index < numberRows.length; index++) {
    const name = String(values.get('school-' + index) || '').trim();
    const number = String(values.get('number-' + index) || '');
    const logo = String(values.get('logo-' + index) || '').trim();
    if (!number) {
      if (logo !== (data.schoolLogos?.[name] || '')) throw new Error('เลือกหมายเลขของ ' + name + ' ก่อนบันทึกโลโก้');
      continue;
    }
    if (!teamNumbers.includes(number)) throw new Error('เลือกหมายเลขทีม 1–10');
    if (!name) throw new Error('กรอกชื่อโรงเรียนสำหรับทีม ' + number);
    if (teams[number]) throw new Error('หมายเลขทีม ' + number + ' ถูกเลือกซ้ำ กรุณาเลือกหมายเลขให้ต่างกัน');
    if (names.has(name)) throw new Error('โรงเรียน ' + name + ' ถูกกำหนดมากกว่าหนึ่งหมายเลข');
    teams[number] = name;
    logos[number] = logo;
    names.add(name);
  }
  return {teams, previous: {...numberPrevious}, logos};
}

numbersForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !key) return;
  let input;
  try {
    input = enteredTeamNumbers(new FormData(numbersForm));
  } catch (error) {
    status('team-numbers-status', error.message, true);
    return;
  }
  const save = byId('save-team-numbers');
  busy = save.disabled = true;
  byId('team-number-fields').inert = true;
  status('team-numbers-status', 'กำลังบันทึกหมายเลขโรงเรียน…');
  try {
    await saveTeamNumbers(key, input);
    data = await readSports(key);
    numbersDirty = false;
    render();
    status('team-numbers-status', 'บันทึกหมายเลขแล้ว ชื่อและโลโก้อัปเดตในทุกรายการ');
  } catch (error) {
    status('team-numbers-status', error.message, true);
  } finally {
    busy = save.disabled = false;
    byId('team-number-fields').inert = false;
  }
});

byId('randomize-groups').addEventListener('click', async () => {
  if (busy || !key) return;
  if (numbersDirty) {
    status('workspace-status', 'บันทึกหมายเลขโรงเรียนก่อนสุ่มสาย', true);
    return;
  }
  const button = byId('randomize-groups');
  busy = button.disabled = true;
  status('workspace-status', 'กำลังสุ่มสายเพื่อกระจายคู่โรงเรียนร่วมสาย…');
  try {
    await randomizeGroups(key);
    data = await readSports(key);
    render();
    status('workspace-status', 'บันทึกผลสุ่มสายแล้ว เวลาเริ่ม จบ และสนามใช้คิวเดิม');
  } catch (error) {
    status('workspace-status', error.message, true);
  } finally {
    busy = button.disabled = false;
  }
});

function renderMiddleSchools() {
  const selected = data.middleSchoolNumbers || [];
  const choices = Object.fromEntries(teamNumbers.filter(number => data.teamNumbers?.[number]).map(number =>
    [number, 'ทีม ' + number + ' · ' + data.teamNumbers[number]]));
  byId('middle-school-fields').innerHTML = Array.from({length: 4}, (_, i) =>
    '<label>ช่องแข่งขันมัธยม ' + (i + 1) + '<select name="middle-' + i + '" required>' +
      options(choices, selected[i] || '', 'เลือกโรงเรียนขยายโอกาส') + '</select></label>').join('');
  byId('middle-schools-summary').textContent = selected.length === 4 ? 'กำหนดครบ 4 โรงเรียนแล้ว' : 'ยังไม่ได้กำหนดโรงเรียนขยายโอกาส';
  byId('save-middle-schools').disabled = data.formatVersion < 7;
}
byId('middle-schools-form').addEventListener('change', () => { middleDirty = true; });
byId('middle-schools-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !key) return;
  if (numbersDirty) { status('middle-schools-status', 'บันทึกหมายเลขโรงเรียนก่อนเลือกโรงเรียนขยายโอกาส', true); return; }
  const values = new FormData(event.currentTarget);
  const numbers = Array.from({length: 4}, (_, i) => String(values.get('middle-' + i) || ''));
  if (numbers.some(number => !data.teamNumbers?.[number]) || new Set(numbers).size !== 4) {
    status('middle-schools-status', 'เลือกโรงเรียนขยายโอกาสให้ครบ 4 โรงเรียนและไม่ซ้ำกัน', true); return;
  }
  busy = true;
  const button = byId('save-middle-schools'); button.disabled = true;
  byId('middle-school-fields').inert = true;
  try {
    await saveMiddleSchools(key, {numbers});
    data = await readSports(key); middleDirty = false; render();
    status('middle-schools-status', 'บันทึกแล้ว รายชื่อและโลโก้ทุกรายการมัธยมใช้เฉพาะ 4 โรงเรียนนี้');
  } catch (error) { status('middle-schools-status', error.message, true); }
  finally { busy = false; button.disabled = false; byId('middle-school-fields').inert = false; }
});
