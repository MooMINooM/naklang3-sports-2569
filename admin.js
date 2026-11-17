import {readSports, saveMatch, saveDraw} from './sports-api.js?v=20261117-bracket';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, options, blank,
} from './sports-data.js?v=20261117-bracket';

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
const drawDialog = byId('draw-dialog');
const drawForm = byId('draw-form');
const drawFields = drawForm.elements;
const managedFields = ['sport', 'level', 'type', 'stage', 'group'];
const publishedFilter = byId('published-filter');
let data = blank;
let key = '';
let editing = null;
let busy = false;

dayFilter.innerHTML = options(DAYS, '', 'ทุกวัน');
sportFilter.innerHTML = options(SPORTS, '', 'ทุกกีฬา');

function status(id, message, error = false) {
  const target = byId(id);
  target.textContent = message;
  target.dataset.error = String(error);
}

function render() {
  loginPanel.hidden = Boolean(key);
  workspace.hidden = !key;
  if (!key) return;

  byId('open-draw').disabled = !data.draws?.length;
  const publishedCount = data.matches.filter(match => match.published).length;
  byId('summary').textContent = data.matches.length + ' คู่ · เผยแพร่แล้ว ' + publishedCount + ' คู่';
  const matches = ordered(data.matches.filter(match =>
    (!dayFilter.value || Number(dayFilter.value) === match.day) &&
    (!sportFilter.value || sportFilter.value === match.sport) &&
    (!publishedFilter.value || (publishedFilter.value === 'published') === match.published)));

  if (!matches.length) {
    list.innerHTML = '<div class="empty">' + (data.matches.length ? 'ไม่มีคู่ตามตัวกรอง' : 'ยังไม่มีคู่แข่งขัน') + '</div>';
    return;
  }

  const rows = matches.map(match => {
    const end = clock(minutes(match.start) + duration(match, data.settings));
    const score = hasScore(match) ? esc(match.homeScore) + ' – ' + esc(match.awayScore) +
      '<small>' + (match.winnerSide ? 'ชนะ: ' + esc(match[match.winnerSide]) : 'เสมอ') + '</small>' :
      match.ready === false ? 'รอยืนยันทีม' : 'รอผล';
    return '<tr><td><strong>' + DAYS[match.day] + '</strong><small>' + esc(match.start) + '–' + end +
      '</small></td><td><strong>' + esc(match.home) + ' พบ ' + esc(match.away) + '</strong><small>' +
      esc(SPORTS[match.sport]) + ' · ' + esc(LEVELS[match.level]) + esc(TYPES[match.type]) + ' · ' + esc(STAGES[match.stage]) +
      (match.group ? ' ' + esc(match.group) : '') + '</small></td><td>' + esc(fieldName(data.fields, match.field)) +
      '</td><td>' + score + '</td><td><span class="pill' + (match.published ? ' live">เผยแพร่แล้ว' : '">ฉบับร่าง') +
      '</span></td><td><button type="button" data-edit="' + esc(match.id) + '">แก้ไข / ลงผล</button></td></tr>';
  });
  list.innerHTML = '<div class="scroll"><table><thead><tr><th>วันและเวลา</th><th>คู่แข่งขัน</th><th>สนาม</th><th>ผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>' +
    rows.join('') + '</tbody></table></div>';
}

function endSession(message = '') {
  key = '';
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

function edit(match) {
  if (busy) return;
  editing = match || null;
  const day = match?.day || Number(dayFilter.value) || 1;
  form.reset();
  byId('form-title').textContent = match ? 'แก้ไขคู่และบันทึกผล' : 'เพิ่มคู่แข่งขัน';
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

form.addEventListener('change', event => {
  if (['sport', 'level', 'type', 'stage', 'day', 'start'].includes(event.target.name)) syncMatchChoices();
  updateScoreHint();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !key) return;
  const values = new FormData(form);
  const match = Object.fromEntries(values);
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
  match.published = values.has('published');
  for (const field of ['homeScore', 'awayScore']) match[field] = match[field] ? Number(match[field]) : '';

  const save = byId('save-match');
  const cancel = byId('cancel-match');
  busy = save.disabled = cancel.disabled = true;
  status('form-status', 'กำลังบันทึกใน Google Sheets…');
  try {
    await saveMatch(key, match);
    data = await readSports(key);
    dialog.close();
    render();
    status('workspace-status', 'บันทึกคู่แข่งขันใน Google Sheets แล้ว');
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
byId('new-match').addEventListener('click', () => edit());
for (const filter of [dayFilter, sportFilter, publishedFilter]) filter.addEventListener('change', render);
list.addEventListener('click', event => {
  const id = event.target.closest('[data-edit]')?.dataset.edit;
  const match = id && data.matches.find(row => row.id === id);
  if (match) edit(match);
});

function updateScoreHint(tieWinner = fields.tieWinner.value) {
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
  const message = fields.homeScore.disabled ? 'รอผลจับสลากหรือผลรอบก่อนหน้า' :
    !complete ? '' : needsWinner ? 'ระบุผู้ชนะตามผลการตัดสิน' : tied ? 'ผลการแข่งขันเสมอ' :
    'ผู้ชนะ: ' + (Number(home) > Number(away) ? fields.home.value : fields.away.value);
  status('score-hint', message);
}

function drawOptions() {
  return Object.fromEntries((data.draws || []).map(draw => [
    draw.key, SPORTS[draw.sport] + ' · ' + LEVELS[draw.level] + TYPES[draw.type],
  ]));
}

function renderDraw() {
  const draw = data.draws.find(item => item.key === drawFields.event.value);
  if (!draw) return;
  const joint = ['football', 'volleyball'].includes(draw.sport) ? ['บ้านหนองด้วง–ซำขอนแก่น'] : [];
  byId('draw-schools').innerHTML = data.schools.concat(joint).map(name => '<option value="' + esc(name) + '"></option>').join('');
  byId('draw-slots').innerHTML = draw.slots.map((slot, index) =>
    '<label>ทีม ' + (index + 1) + (slot.length === 1 ? '' : ' · สาย ' + slot[0] + ' (' + slot + ')') +
    ' <input maxlength="100" name="' + slot + '" list="draw-schools" value="' + esc(draw.teams[slot]) + '"></label>').join('');
  drawFields.tieOrder.value = draw.tieOrder;
  byId('draw-tie').hidden = draw.level === 'middle';
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
  const save = byId('save-draw');
  busy = save.disabled = drawFields.event.disabled = true;
  status('draw-status', 'กำลังบันทึกผลจับสลาก…');
  try {
    const teams = Object.fromEntries(draw.slots.map(slot => [slot, drawFields.namedItem(slot).value]));
    await saveDraw(key, {key: draw.key, teams, tieOrder: drawFields.tieOrder.value});
    data = await readSports(key);
    render();
    renderDraw();
    status('draw-status', 'บันทึกผลจับสลากแล้ว');
  } catch (error) {
    status('draw-status', error.message, true);
  } finally {
    busy = save.disabled = drawFields.event.disabled = false;
  }
});
