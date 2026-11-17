import {readSports} from './sports-api.js';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, options, standings,
} from './sports-data.js';

const content = document.querySelector('#content');
const status = document.querySelector('#sync');
const error = document.querySelector('#connection-error');
const reload = document.querySelector('#reload');
const routes = ['schedule', 'results', 'venues'];
const filters = {day: 1, sport: '', level: '', type: '', resultSport: 'football'};
let data;
let loading = false;

function view() {
  const hash = location.hash.slice(1);
  return routes.includes(hash) ? hash : 'schedule';
}

function select(id, label, values, placeholder) {
  return '<label>' + label + ' <select class="control" id="' + id + '">' +
    options(values, filters[id], placeholder) + '</select></label>';
}

function matchTable(matches, emptyMessage) {
  if (!matches.length) return '<div class="empty">' + emptyMessage + '</div>';
  const lines = ordered(matches).map(match => {
    const end = clock(minutes(match.start) + duration(match.sport, match.level));
    const score = hasScore(match) ? esc(match.homeScore) + ' – ' + esc(match.awayScore) : 'รอแข่งขัน';
    return '<tr><td><strong>' + esc(match.start) + '</strong><small>ถึง ' + end +
      '</small></td><td><span class="badge ' + esc(match.sport) + '">' + esc(SPORTS[match.sport]) +
      '</span><small>' + esc(LEVELS[match.level]) + ' · ' + esc(TYPES[match.type]) +
      '</small></td><td><strong>' + esc(match.home) + ' พบ ' + esc(match.away) +
      '</strong><small>' + esc(STAGES[match.stage]) + (match.group ? ' · กลุ่ม ' + esc(match.group) : '') +
      '</small></td><td>' + esc(fieldName(data.fields, match.field)) + '</td><td>' + score + '</td></tr>';
  });
  return '<div class="scroll"><table><thead><tr><th>เวลา</th><th>รายการ</th><th>คู่แข่งขัน</th><th>สนาม</th><th>ผล</th></tr></thead><tbody>' +
    lines.join('') + '</tbody></table></div>';
}

function schedule() {
  const matches = data.matches.filter(match => match.day === filters.day &&
    (!filters.sport || filters.sport === match.sport) &&
    (!filters.level || filters.level === match.level) &&
    (!filters.type || filters.type === match.type));
  const dayButtons = Object.entries(DAYS).map(([day, label]) =>
    '<button class="btn" type="button" data-day="' + day + '" aria-pressed="' + (Number(day) === filters.day) + '">' + label + '</button>');
  return '<section class="panel"><div class="panelHead"><div><h2>ตารางแข่งขัน</h2><small>' + matches.length + ' คู่ · ' + DAYS[filters.day] +
    '</small></div></div><div class="days">' + dayButtons.join('') + '</div><div class="filters">' +
    select('sport', 'กีฬา', SPORTS, 'ทุกกีฬา') + select('level', 'รุ่น', LEVELS, 'ทุกรุ่น') +
    select('type', 'ประเภท', TYPES, 'ทุกประเภท') + '</div>' +
    matchTable(matches, data.matches.length ? 'ไม่มีคู่แข่งขันตามตัวกรองนี้' : 'ยังไม่มีตารางแข่งขันที่เผยแพร่') + '</section>';
}

function results() {
  const groups = standings(data.matches, filters.resultSport);
  const scores = data.matches.filter(match => match.sport === filters.resultSport && hasScore(match));
  const tables = groups.map(({match, rows}) => {
    const lines = rows.map(row => '<tr><td>' + row.rank + '</td><td>' + esc(row.name) + '</td><td>' + row.played +
      '</td><td>' + row.wins + '</td><td>' + row.ties + '</td><td>' + row.losses + '</td><td>' + row.points + '</td></tr>');
    return '<h3>' + esc(LEVELS[match.level]) + ' ' + esc(TYPES[match.type]) + (match.group ? ' · กลุ่ม ' + esc(match.group) : ' · พบกันหมด') +
      '</h3><div class="scroll"><table><thead><tr><th>อันดับ</th><th>ทีม</th><th>แข่ง</th><th>ชนะ</th><th>เสมอ</th><th>แพ้</th><th>คะแนน</th></tr></thead><tbody>' +
      lines.join('') + '</tbody></table></div>';
  });
  return '<section class="panel"><div class="panelHead"><h2>ผลและอันดับ</h2>' + select('resultSport', 'กีฬา', SPORTS) +
    '</div><div class="panelHead"><h3>ผลการแข่งขัน</h3></div>' + matchTable(scores, 'ยังไม่มีผลการแข่งขันที่เผยแพร่') +
    (tables.length ? '<div class="content"><h3>อันดับเบื้องต้น</h3><small>ฟุตบอลชนะ 3 คะแนน เสมอ 1 คะแนน กีฬาอื่นเรียงตามจำนวนชนะ</small>' +
    tables.join('') + '</div>' : '') + '</section>';
}

function venues() {
  return '<section class="panel"><div class="panelHead"><h2>โรงเรียนและสนาม</h2></div><div class="content"><h3>โรงเรียน</h3><p>' +
    data.schools.map(esc).join(' · ') + '</p><h3>สนามแข่งขัน</h3></div><div class="scroll"><table><thead><tr><th>รหัส</th><th>สนาม</th><th>กีฬา</th><th>รุ่น</th></tr></thead><tbody>' +
    data.fields.map(field => '<tr><td>' + esc(field.id) + '</td><td>' + esc(field.name) + '</td><td>' + esc(SPORTS[field.sport]) +
      '</td><td>' + esc(field.levels.split(',').map(level => LEVELS[level]).join(' / ')) + '</td></tr>').join('') + '</tbody></table></div></section>';
}

function render() {
  const route = view();
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-current', String(button.dataset.view === route));
  });
  if (data) content.innerHTML = {schedule, results, venues}[route]();
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    data = await readSports();
    status.textContent = 'อัปเดตแล้ว ' + new Date().toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'});
    error.hidden = reload.hidden = true;
    render();
  } catch (failure) {
    status.textContent = 'เชื่อมต่อข้อมูลไม่ได้';
    error.textContent = failure.message;
    error.hidden = reload.hidden = false;
    if (!data) content.replaceChildren();
  } finally {
    loading = false;
  }
}

document.querySelector('nav').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) location.hash = button.dataset.view;
});
content.addEventListener('click', event => {
  const button = event.target.closest('[data-day]');
  if (!button) return;
  filters.day = Number(button.dataset.day);
  render();
  content.querySelector('[aria-pressed="true"]')?.focus();
});
content.addEventListener('change', event => {
  const {id, value} = event.target;
  if (!Object.hasOwn(filters, id)) return;
  filters[id] = value;
  render();
  document.getElementById(id)?.focus();
});
window.addEventListener('hashchange', render);
reload.addEventListener('click', refresh);
refresh();
window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
