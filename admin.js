import {schoolNameMarkup} from './school-label.js?v=20261123-wide-groups';
import {sportTeamNumbers} from './supabase/functions/naklang3-sports/team-numbering.js?v=20261123-combined';
import {knockoutMarkup} from './knockout.js?v=20261123-knockout';
import {readSports, saveMatch, saveDraw, saveTeamNumbers} from './sports-api.js?v=20261123-supabase';
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
let data = blank;
let key = '';
let editing = null;
let scoreOnly = false;
let busy = false;
let clearSets = false;
let numberRows = [];
let numberPrevious = {};
let numbersDirty = false;
const setGrid = byId('set-grid');
setGrid.innerHTML = '<div></div><strong id="set-team-home">ทีมที่ 1</strong><strong id="set-team-away">ทีมที่ 2</strong>' + [1, 2, 3].map(set => '<div class="set-label">เซต ' + set + '</div>' +
  ['home', 'away'].map((side, i) => '<input data-set type="number" min="0" max="999" name="' + side + 'Set' + set +
    '" aria-label="แต้มเซต ' + set + ' ทีมที่ ' + (i + 1) + '">').join('')).join('');
const setFields = [...setGrid.querySelectorAll('input')];

dayFilter.innerHTML = options(DAYS, '', 'ทุกวัน');
sportFilter.innerHTML = options(SPORTS, '', 'ทุกกีฬา');
levelFilter.innerHTML = options(LEVELS, '', 'ทุกรุ่น');
typeFilter.innerHTML = options(TYPES, '', 'ทุกประเภท');

function status(id, message, error = false) {
  const target = byId(id);
  target.textContent = message;
  target.dataset.error = String(error);
}

function render() {
  loginPanel.hidden = Boolean(key);
  workspace.hidden = !key;
  if (!key) return;
  if (!numbersDirty) renderTeamNumbers();

  byId('open-team-numbers').disabled = data.formatVersion < 4 || !data.teamNumbers;
  byId('open-draw').disabled = !data.draws?.some(draw => draw.level !== 'middle');
  const publishedCount = data.matches.filter(match => match.published).length;
  byId('summary').textContent = data.matches.length + ' คู่ · เผยแพร่แล้ว ' + publishedCount + ' คู่';
  const matches = ordered(data.matches.filter(match =>
    (roundFilter.value === 'knockout' || !dayFilter.value || Number(dayFilter.value) === match.day) &&
    (!levelFilter.value || levelFilter.value === match.level) &&
    (!typeFilter.value || typeFilter.value === match.type) &&
    (!roundFilter.value || (roundFilter.value === 'knockout' ? ['semi', 'third', 'final'].includes(match.stage) : ['group', 'league'].includes(match.stage))) &&
    (!sportFilter.value || sportFilter.value === match.sport) &&
    (!publishedFilter.value || (publishedFilter.value === 'published') === match.published)));

  dayFilter.disabled = roundFilter.value === 'knockout';
  if (roundFilter.value === 'knockout') {
    list.innerHTML = knockoutMarkup(matches, data.fields, {admin: true, qualifiers: data.qualifiers || [], schoolName: name => schoolNameMarkup(name, data.schoolLogos || {})});
    return;
  }

  if (!matches.length) {
    list.innerHTML = '<div class="empty">' + (data.matches.length ? 'ไม่มีคู่ตามตัวกรอง' : 'ยังไม่มีคู่แข่งขัน') + '</div>';
    return;
  }

  const rows = matches.map(match => {
    const end = clock(minutes(match.start) + duration(match, data.settings));
    const detailed = match.scoreSets?.length ? setResult(match.scoreSets) : null;
    const score = hasScore(match) ? esc(match.homeScore) + ' – ' + esc(match.awayScore) + (usesSets(match.sport) ? ' เซต' : '') +
      (detailed ? '<small>' + match.scoreSets.map(pair => pair.join('–')).join(' / ') +
        '<br>แต้มรวม ' + detailed.points.join('–') + '</small>' : '') +
      '<small>' + (match.winnerSide ? 'ชนะ: ' + esc(match[match.winnerSide]) : 'เสมอ') + '</small>' :
      match.ready === false ? 'ยังระบุคู่แข่งขันไม่ครบ' : 'รอบันทึกผล';
    return '<tr><td><strong>' + DAYS[match.day] + '</strong><small>' + esc(match.start) + '–' + end +
      '</small></td><td><strong>' + schoolNameMarkup(match.home, data.schoolLogos) + ' พบ ' + schoolNameMarkup(match.away, data.schoolLogos) + '</strong><small>' +
      esc(SPORTS[match.sport]) + ' · ' + esc(LEVELS[match.level]) + esc(TYPES[match.type]) + ' · ' + esc(STAGES[match.stage]) +
      (match.group ? ' ' + esc(match.group) : '') + '</small></td><td>' + esc(fieldName(data.fields, match.field)) +
      '</td><td>' + score + '</td><td><span class="pill' + (match.published ? ' live">เผยแพร่แล้ว' : '">ฉบับร่าง') +
      '</span></td><td><div class="row-actions"><button class="primary" type="button" data-score="' + esc(match.id) + '">' +
      (hasScore(match) ? 'แก้ผล' : 'ลงผล') + '</button><button type="button" data-edit="' + esc(match.id) +
      '">แก้ไขคิว</button></div></td></tr>';
  });
  list.innerHTML = '<div class="scroll"><table><thead><tr><th>วันและเวลา</th><th>คู่แข่งขัน</th><th>สนาม</th><th>ผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' +
    rows.join('') + '</tbody></table></div>';
}

function endSession(message = '') {
  key = '';
  numbersDirty = false;
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
    byId('match-context-teams').textContent = match.home + ' พบ ' + match.away;
    byId('match-context-details').textContent = [
      SPORTS[match.sport], LEVELS[match.level] + TYPES[match.type], STAGES[match.stage],
      DAYS[match.day] + ' ' + match.start + ' น.',
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
  updateScoreHint(match?.tieWinner);
  status('form-status', '');
  dialog.showModal();
}

function syncMatchChoices(stage = fields.stage.value, field = fields.field.value) {
  const [sport, level, type, day, start] = ['sport', 'level', 'type', 'day', 'start'].map(name => fields[name].value);
  const stages = level === 'middle' ? {league: STAGES.league} : Object.fromEntries(
    Object.entries(STAGES).filter(([id]) => id !== 'league'));
  fields.stage.innerHTML = options(stages, stage);
  byId('group-field').hidden = fields.stage.value !== 'group';

  const {convertDay, convertTime} = data.settings;
  const converted = Number(day) > Number(convertDay) || (Number(day) === Number(convertDay) && start >= convertTime);
  const available = data.fields.filter(venue => {
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
    byId('new-match').focus();
  } catch (error) {
    status('login-status', error.message, true);
  } finally {
    button.disabled = busy = false;
  }
});

byId('clear-sets').addEventListener('click', () => {
  for (const field of setFields) field.value = '';
  clearSets = true;
  updateScoreHint();
});
setGrid.addEventListener('input', () => updateScoreHint());
form.addEventListener('change', event => {
  if (['sport', 'level', 'type', 'stage', 'day', 'start'].includes(event.target.name)) syncMatchChoices();
  updateScoreHint();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !key || (scoreOnly && editing.ready === false)) return;
  const values = new FormData(form);
  const match = Object.fromEntries(values);
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
  busy = save.disabled = cancel.disabled = true;
  status('form-status', 'กำลังบันทึกผลการแข่งขัน…');
  try {
    await saveMatch(key, match);
    data = await readSports(key);
    dialog.close();
    render();
    status('workspace-status', scoreOnly ? 'บันทึกผลการแข่งขันแล้ว' : 'บันทึกคู่แข่งขันแล้ว');
  } catch (error) {
    status('form-status', error.message, true);
  } finally {
    busy = save.disabled = cancel.disabled = false;
  }
});
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
byId('cancel-match').addEventListener('click', () => dialog.close());
byId('logout').addEventListener('click', () => { if (!busy) endSession(); });
byId('refresh').addEventListener('click', refresh);
byId('open-knockout').addEventListener('click', () => {
  if (busy) return;
  roundFilter.value = 'knockout';
  render();
  list.scrollIntoView({behavior: 'smooth', block: 'start'});
});
byId('new-match').addEventListener('click', () => edit());
for (const filter of [dayFilter, sportFilter, publishedFilter, roundFilter, levelFilter, typeFilter]) filter.addEventListener('change', render);
list.addEventListener('click', event => {
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

function updateScoreHint(tieWinner = fields.tieWinner.value) {
  const setSport = usesSets(fields.sport.value);
  const unresolved = editing?.ready === false;
  const waiting = ['group', 'league'].includes(fields.stage.value)
    ? 'กรอกชื่อโรงเรียนให้ครบทั้งสองทีมที่เมนูกำหนดเลขทีมโรงเรียนก่อนบันทึกผล'
    : 'รอผลรอบก่อนหน้าเพื่อยืนยันคู่แข่งขัน';
  if (editing && !scoreOnly) {
    byId('single-scores').hidden = byId('set-scores').hidden = byId('tie-field').hidden = true;
    fields.homeScore.disabled = fields.awayScore.disabled = byId('set-scores').disabled = fields.tieWinner.disabled = true;
    fields.tieWinner.required = false;
    status('score-hint', '');
    return;
  }
  const label = fields.sport.value === 'football' ? 'ประตู' : 'แต้ม';
  document.querySelector('#single-home span').textContent = label + ' · ' + (fields.home.value || 'ทีมที่ 1');
  document.querySelector('#single-away span').textContent = label + ' · ' + (fields.away.value || 'ทีมที่ 2');
  byId('single-scores').hidden = setSport;
  fields.homeScore.disabled = fields.awayScore.disabled = setSport || unresolved;
  byId('set-scores').hidden = !setSport;
  byId('set-scores').disabled = unresolved;
  if (setSport) {
    byId('tie-field').hidden = fields.tieWinner.disabled = true;
    fields.tieWinner.required = false;
    const names = [fields.home.value || 'ทีมที่ 1', fields.away.value || 'ทีมที่ 2'];
    byId('set-team-home').textContent = names[0];
    byId('set-team-away').textContent = names[1];
    setFields.forEach((field, i) => field.setAttribute('aria-label',
      'แต้มเซต ' + (Math.floor(i / 2) + 1) + ' ' + names[i % 2]));
    try {
      const sets = enteredSets();
      const result = setResult(sets);
      const legacy = editing && hasScore(editing) && !editing.scoreSets?.length && !clearSets;
      const message = unresolved ? waiting : sets.length ?
        'เซต ' + result.wins.join('–') + ' · แต้มรวม ' + result.points.join('–') + (result.finished ?
          ' · ผู้ชนะ ' + names[result.wins[0] === 2 ? 0 : 1] : ' · ยังไม่จบการแข่งขัน') :
        legacy ? 'ผลเดิม ' + editing.homeScore + '–' + editing.awayScore + ' เซต ยังไม่มีแต้มรายเซต' :
        names.join(' พบ ');
      status('score-hint', message);
    } catch (error) {
      status('score-hint', error.message, true);
    }
    return;
  }
  const home = fields.homeScore.value;
  const away = fields.awayScore.value;
  const complete = home !== '' && away !== '';
  const tied = complete && Number(home) === Number(away);
  const knockout = ['semi', 'third', 'final'].includes(fields.stage.value);
  const needsWinner = tied && knockout && !fields.homeScore.disabled;
  fields.tieWinner.innerHTML = options({home: fields.home.value, away: fields.away.value}, tieWinner, 'เลือกผู้ชนะ');
  fields.tieWinner.disabled = !needsWinner;
  fields.tieWinner.required = needsWinner;
  byId('tie-field').hidden = !needsWinner;
  const message = unresolved ? waiting :
    !complete ? '' : needsWinner ? 'ระบุผู้ชนะตามผลการตัดสิน' : tied ? 'ผลการแข่งขันเสมอ' :
    'ผู้ชนะ: ' + (Number(home) > Number(away) ? fields.home.value : fields.away.value);
  status('score-hint', message);
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
