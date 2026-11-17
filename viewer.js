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

function matchCard(match, {compact = false, showDay = false} = {}) {
  const scored = hasScore(match);
  const end = clock(minutes(match.start) + duration(match.sport, match.level));
  const timing = (showDay ? DAYS[match.day] + ' · ' : '') + match.start + (compact ? '' : '–' + end);
  const team = (name, score) => '<div class="team"><span>' + esc(name) + '</span>' +
    (scored ? '<b class="score" aria-label="คะแนน ' + esc(score) + '">' + esc(score) + '</b>' : '') + '</div>';
  return '<article class="match-card ' + esc(match.sport) + '">' +
    '<div class="match-meta"><b>' + esc(SPORTS[match.sport]) + '</b><span class="time">' + esc(timing) + '</span></div>' +
    team(match.home, match.homeScore) + team(match.away, match.awayScore) +
    '<div class="match-foot"><span>' + esc(LEVELS[match.level]) + ' · ' + esc(TYPES[match.type]) +
    '</span><span>' + esc(fieldName(data.fields, match.field)) + '</span></div>' +
    (compact ? '' : '<div class="match-foot"><span>' + esc(STAGES[match.stage]) +
      (match.group ? ' · กลุ่ม ' + esc(match.group) : '') + '</span><span>' +
      (scored ? 'จบการแข่งขัน' : 'รอแข่งขัน') + '</span></div>') + '</article>';
}

function latestResults() {
  const latest = ordered(data.matches.filter(hasScore)).reverse().slice(0, 3);
  return '<aside aria-labelledby="latest-title"><div class="section-heading"><h3 id="latest-title">ผลล่าสุด</h3>' +
    (latest.length ? '<a href="#results">ดูผลทั้งหมด</a>' : '') + '</div><div class="latest-list">' +
    (latest.length ? latest.map(match => matchCard(match, {compact: true, showDay: true})).join('') : '<p class="empty">ยังไม่มีผลการแข่งขันที่เผยแพร่</p>') +
    '</div></aside>';
}

function schedule() {
  const matches = ordered(data.matches.filter(match => match.day === filters.day &&
    (!filters.sport || filters.sport === match.sport) &&
    (!filters.level || filters.level === match.level) &&
    (!filters.type || filters.type === match.type)));
  const dayButtons = Object.entries(DAYS).map(([day, label]) =>
    '<button class="control-button" type="button" data-day="' + day + '" aria-pressed="' +
    (Number(day) === filters.day) + '">' + label + '</button>').join('');
  const cards = matches.length ? '<div class="fixture-grid">' + matches.map(match => matchCard(match)).join('') + '</div>' :
    '<p class="empty">' + (data.matches.length ? 'ไม่มีคู่แข่งขันตามตัวกรองนี้' : 'ยังไม่มีโปรแกรมแข่งที่เผยแพร่') + '</p>';

  return '<div class="competition-grid"><section aria-labelledby="schedule-title"><div class="section-heading">' +
    '<h2 id="schedule-title">โปรแกรมแข่ง</h2><small>' + DAYS[filters.day] + ' · ' + matches.length + ' คู่</small></div>' +
    '<div class="days" aria-label="วันแข่งขัน">' + dayButtons + '</div><div class="filters">' +
    select('sport', 'กีฬา', SPORTS, 'ทุกกีฬา') + select('level', 'รุ่น', LEVELS, 'ทุกรุ่น') +
    select('type', 'ประเภท', TYPES, 'ทุกประเภท') + '</div>' + cards + '</section>' + latestResults() + '</div>';
}

function results() {
  const groups = standings(data.matches, filters.resultSport);
  const scores = ordered(data.matches.filter(match => match.sport === filters.resultSport && hasScore(match))).reverse();
  const tables = groups.map(({match, rows}) => {
    const lines = rows.map(row => '<tr><td>' + row.rank + '</td><td>' + esc(row.name) + '</td><td>' + row.played +
      '</td><td>' + row.wins + '</td><td>' + row.ties + '</td><td>' + row.losses + '</td><td>' + row.points + '</td></tr>');
    return '<h3>' + esc(LEVELS[match.level]) + ' ' + esc(TYPES[match.type]) + (match.group ? ' · กลุ่ม ' + esc(match.group) : ' · พบกันหมด') +
      '</h3><div class="table-scroll"><table><thead><tr><th>อันดับ</th><th>ทีม</th><th>แข่ง</th><th>ชนะ</th><th>เสมอ</th><th>แพ้</th><th>คะแนน</th></tr></thead><tbody>' +
      lines.join('') + '</tbody></table></div>';
  });

  return '<section aria-labelledby="results-title"><div class="section-heading"><h2 id="results-title">ผลและอันดับ</h2></div><div class="filters">' +
    select('resultSport', 'กีฬา', SPORTS) + '</div>' +
    (scores.length ? '<div class="fixture-grid">' + scores.map(match => matchCard(match, {showDay: true})).join('') + '</div>' :
      '<p class="empty">ยังไม่มีผลการแข่งขันที่เผยแพร่</p>') +
    (tables.length ? '<div class="table-panel"><h3>อันดับเบื้องต้น</h3><p>ฟุตบอลชนะ 3 คะแนน เสมอ 1 คะแนน กีฬาอื่นเรียงตามจำนวนชนะ</p>' +
      tables.join('') + '</div>' : '') + '</section>';
}

function venues() {
  const rows = data.fields.map(field => '<tr><td>' + esc(field.id) + '</td><td>' + esc(field.name) + '</td><td>' + esc(SPORTS[field.sport]) +
    '</td><td>' + esc(field.levels.split(',').map(level => LEVELS[level]).join(' / ')) + '</td></tr>');
  return '<section aria-labelledby="venues-title"><div class="section-heading"><h2 id="venues-title">โรงเรียนและสนาม</h2></div>' +
    '<div class="table-panel"><h3>โรงเรียน</h3><p class="school-list">' + data.schools.map(esc).join(' · ') +
    '</p><h3>สนามแข่งขัน</h3><div class="table-scroll"><table><thead><tr><th>รหัส</th><th>สนาม</th><th>กีฬา</th><th>รุ่น</th></tr></thead><tbody>' +
    rows.join('') + '</tbody></table></div></div></section>';
}

function render() {
  const route = view();
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === route) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  if (data) content.innerHTML = {schedule, results, venues}[route]();
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const latest = await readSports();
    const changed = JSON.stringify(latest) !== JSON.stringify(data);
    data = latest;
    status.dataset.state = 'connected';
    status.textContent = 'อัปเดต ' + new Date().toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'}) + ' น.';
    error.hidden = reload.hidden = true;
    if (changed) render();
  } catch (failure) {
    status.dataset.state = 'failed';
    status.textContent = 'เชื่อมต่อข้อมูลไม่ได้';
    error.textContent = failure.message;
    error.hidden = reload.hidden = false;
    if (!data) content.replaceChildren();
  } finally {
    loading = false;
  }
}

function go(route) {
  if (location.hash.slice(1) !== route) location.hash = route;
  else content.scrollIntoView({block: 'start'});
}

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-view], a[href="#schedule"], a[href="#results"]');
  if (!trigger) return;
  event.preventDefault();
  go(trigger.dataset.view || trigger.hash.slice(1));
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
window.addEventListener('hashchange', () => {
  render();
  if (routes.includes(location.hash.slice(1))) content.scrollIntoView({block: 'start'});
});
reload.addEventListener('click', refresh);
render();
refresh();
window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
