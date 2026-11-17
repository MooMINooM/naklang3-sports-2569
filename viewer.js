import {readSports} from './sports-api.js';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, options, standings,
} from './sports-data.js';

const content = document.querySelector('#content');
const featured = document.querySelector('#featured');
const status = document.querySelector('#sync');
const error = document.querySelector('#connection-error');
const errorMessage = document.querySelector('#error-message');
const reload = document.querySelector('#reload');
const routes = ['schedule', 'results', 'venues'];
const navigation = document.querySelector('.competition-nav');
const filters = {day: 1, sport: '', level: '', type: '', resultSport: ''};
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

function matchCard(match, {showDay = false} = {}) {
  const scored = hasScore(match);
  const end = clock(minutes(match.start) + duration(match.sport, match.level));
  const timing = showDay ? DAYS[match.day] + ' · ' + match.start + ' น.' : match.start + '–' + end + ' น.';
  const stage = STAGES[match.stage] + (match.group ? ' · กลุ่ม ' + match.group : '');
  const score = scored
    ? '<span class="score" role="img" aria-label="คะแนน ' + esc(match.homeScore) + ' ต่อ ' + esc(match.awayScore) + '">' +
      '<b>' + esc(match.homeScore) + '</b><span aria-hidden="true">–</span><b>' + esc(match.awayScore) + '</b></span>'
    : '<span class="versus">พบ</span>';

  return '<article class="match-card ' + esc(match.sport) + '">' +
    '<div class="match-meta"><b>' + esc(SPORTS[match.sport]) + '</b><span>' +
    esc(LEVELS[match.level]) + ' · ' + esc(TYPES[match.type]) + '</span></div>' +
    '<div class="matchup"><strong class="home">' + esc(match.home) + '</strong>' + score +
    '<strong class="away">' + esc(match.away) + '</strong></div>' +
    '<div class="match-foot"><span><b class="time">' + esc(timing) + '</b><span class="field">' +
    esc(fieldName(data.fields, match.field)) + '</span></span><span><b class="match-state' +
    (scored ? ' finished">จบการแข่งขัน' : '">รอแข่งขัน') + '</b><span class="stage">' + esc(stage) +
    '</span></span></div></article>';
}

function renderFeatured() {
  const matches = ordered(data.matches);
  const latest = matches.findLast(hasScore);
  const match = latest || matches[0];
  featured.hidden = !match;
  if (!match) return;

  const target = latest ? 'results' : 'schedule';
  featured.innerHTML = '<div class="feature-heading"><h2>' + (latest ? 'ผลล่าสุด' : 'คู่แรกตามโปรแกรม') +
    '</h2><a href="#' + target + '" data-feature="' + (latest ? '' : match.day) +
    '">' + (latest ? 'ดูผลทั้งหมด' : 'ดูตารางแข่ง') +
    '</a></div>' + matchCard(match, {showDay: true});
}

function sportButtons(id) {
  return '<div class="sport-filters" role="group" aria-label="กรองตามกีฬา">' +
    Object.entries({'': 'ทุกกีฬา', ...SPORTS}).map(([sport, label]) =>
      '<button type="button" class="control-button" data-sport-filter="' + id + '" data-sport="' + sport +
      '" aria-pressed="' + (filters[id] === sport) + '">' + label + '</button>').join('') + '</div>';
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

  return '<section aria-labelledby="schedule-title"><div class="section-heading">' +
    '<h2 id="schedule-title">โปรแกรมแข่ง</h2><small>' + DAYS[filters.day] + ' · ' + matches.length + ' คู่</small></div>' +
    '<div class="filter-panel"><div class="days" role="group" aria-label="วันแข่งขัน">' + dayButtons + '</div>' +
    sportButtons('sport') + '<div class="filters">' +
    select('level', 'รุ่น', LEVELS, 'ทุกรุ่น') + select('type', 'ประเภท', TYPES, 'ทุกประเภท') +
    '</div></div>' + cards + '</section>';
}

function results() {
  const groups = filters.resultSport ? standings(data.matches, filters.resultSport) : [];
  const scores = ordered(data.matches.filter(match =>
    hasScore(match) && (!filters.resultSport || match.sport === filters.resultSport))).reverse();
  const tables = groups.map(({match, rows}) => {
    const lines = rows.map(row => '<tr><td>' + row.rank + '</td><td>' + esc(row.name) + '</td><td>' + row.played +
      '</td><td>' + row.wins + '</td><td>' + row.ties + '</td><td>' + row.losses + '</td><td>' + row.points + '</td></tr>');
    return '<h3>' + esc(LEVELS[match.level]) + ' ' + esc(TYPES[match.type]) + (match.group ? ' · กลุ่ม ' + esc(match.group) : ' · พบกันหมด') +
      '</h3><div class="table-scroll"><table><thead><tr><th>อันดับ</th><th>ทีม</th><th>แข่ง</th><th>ชนะ</th><th>เสมอ</th><th>แพ้</th><th>คะแนน</th></tr></thead><tbody>' +
      lines.join('') + '</tbody></table></div>';
  });

  return '<section aria-labelledby="results-title"><div class="section-heading"><h2 id="results-title">ผลและอันดับ</h2>' +
    '<small>' + scores.length + ' คู่ที่มีผล</small></div><div class="filter-panel">' +
    sportButtons('resultSport') + '</div>' +
    (!filters.resultSport && data.matches.length ? '<p class="standings-note">เลือกชนิดกีฬาเพื่อดูตารางอันดับ</p>' : '') +
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
  document.querySelectorAll('.main-nav a').forEach(link => {
    if (link.hash === '#' + route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  if (data) content.innerHTML = {schedule, results, venues}[route]();
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const latest = await readSports();
    const changed = JSON.stringify(latest) !== JSON.stringify(data);
    if (!data && latest.matches.length) filters.day = ordered(latest.matches)[0].day;
    data = latest;
    status.dataset.state = 'connected';
    status.textContent = 'อัปเดต ' + new Date().toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'}) + ' น.';
    error.hidden = true;
    if (changed) {
      renderFeatured();
      render();
    }
  } catch (failure) {
    status.dataset.state = 'failed';
    status.textContent = 'เชื่อมต่อข้อมูลไม่ได้';
    errorMessage.textContent = failure.message;
    error.hidden = false;
    if (!data) content.replaceChildren();
  } finally {
    loading = false;
  }
}

function showContent() {
  navigation.scrollIntoView({block: 'start'});
}

featured.addEventListener('click', event => {
  const link = event.target.closest('[data-feature]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.hash === '#results') filters.resultSport = '';
  else Object.assign(filters, {day: Number(link.dataset.feature), sport: '', level: '', type: ''});
  if (location.hash === link.hash) {
    event.preventDefault();
    render();
    showContent();
  }
  navigation.querySelector('a[href="' + link.hash + '"]').focus({preventScroll: true});
});
content.addEventListener('click', event => {
  const day = event.target.closest('[data-day]');
  const sport = event.target.closest('[data-sport-filter]');
  const button = day || sport;
  if (!button) return;

  if (day) filters.day = Number(day.dataset.day);
  else filters[sport.dataset.sportFilter] = sport.dataset.sport;
  render();
  const selector = day ? '[data-day][aria-pressed="true"]' : '[data-sport-filter][aria-pressed="true"]';
  content.querySelector(selector)?.focus({preventScroll: true});
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
  if (routes.includes(location.hash.slice(1))) showContent();
});
reload.addEventListener('click', refresh);
render();
refresh();
window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
