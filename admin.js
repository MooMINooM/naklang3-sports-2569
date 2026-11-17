import {readSports, saveMatch} from './sports-api.js';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, options, blank,
} from './sports-data.js';

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
    const end = clock(minutes(match.start) + duration(match.sport, match.level));
    const score = hasScore(match) ? esc(match.homeScore) + ' – ' + esc(match.awayScore) : 'รอผล';
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
  fields.group.value = match?.group || 'A';
  fields.published.checked = match?.published || false;
  byId('schools').innerHTML = data.schools.map(school => '<option value="' + esc(school) + '"></option>').join('');
  syncMatchChoices(match?.stage, match?.field);
  status('form-status', '');
  dialog.showModal();
}

function syncMatchChoices(stage = fields.stage.value, field = fields.field.value) {
  const {sport, level, type, day, start} = Object.fromEntries(new FormData(form));
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
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !key) return;
  const values = new FormData(form);
  const match = Object.fromEntries(values);
  match.id = editing?.id || '';
  match.day = Number(match.day);
  match.home = match.home.trim();
  match.away = match.away.trim();
  match.group = match.stage === 'group' ? match.group : '';
  match.published = values.has('published');
  for (const field of ['homeScore', 'awayScore']) match[field] = match[field] === '' ? '' : Number(match[field]);

  const save = byId('save-match');
  const cancel = byId('cancel-match');
  busy = save.disabled = cancel.disabled = true;
  status('form-status', 'กำลังบันทึกใน Google Sheets…');
  try {
    match.id = await saveMatch(key, match);
    data = {...data, matches: data.matches.filter(row => row.id !== match.id).concat(match)};
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
