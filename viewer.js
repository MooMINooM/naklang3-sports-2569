import {readSports} from './sports-api.js';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, options, standings,
} from './sports-data.js?v=20261117-bracket';

const content = document.querySelector('#content');
const competition = document.querySelector('#competition');
const status = document.querySelector('#sync');
const error = document.querySelector('#connection-error');
const errorMessage = document.querySelector('#error-message');
const reload = document.querySelector('#reload');
const routes = ['home', 'schedule', 'results', 'standings', 'venues'];
const sportIcons = {football: '⚽', volleyball: '🏐', takraw: '🟠', petanque: '⚪'};
const navigation = document.querySelector('.main-nav');
const search = document.querySelector('#team-search');
const filters = {day: 1, sport: '', level: '', type: '', resultSport: '', query: '', tableSport: 'football'};
let data;
let loading = false;

function view() {
  const hash = location.hash.slice(1);
  return routes.includes(hash) ? hash : 'home';
}

function select(id, label, values, placeholder) {
  return '<label>' + label + ' <select class="control" id="' + id + '">' +
    options(values, filters[id], placeholder) + '</select></label>';
}

function matchCard(match, {showDay = false} = {}) {
  const scored = hasScore(match);
  const end = clock(minutes(match.start) + duration(match, data.settings));
  const timing = showDay ? DAYS[match.day] + ' · ' + match.start + ' น.' : match.start + '–' + end + ' น.';
  const stage = STAGES[match.stage] + (match.group ? ' · กลุ่ม ' + match.group : '');
  const score = scored
    ? '<span class="score" role="img" aria-label="คะแนน ' + esc(match.homeScore) + ' ต่อ ' + esc(match.awayScore) + '">' +
      '<b>' + esc(match.homeScore) + '</b><span aria-hidden="true">–</span><b>' + esc(match.awayScore) + '</b></span>'
    : '<span class="versus">พบ</span>';

  return '<article class="match-card ' + esc(match.sport) + '">' +
    '<div class="match-meta"><b><span aria-hidden="true">' + sportIcons[match.sport] + '</span> ' + esc(SPORTS[match.sport]) + '</b><span>' +
    esc(LEVELS[match.level]) + ' · ' + esc(TYPES[match.type]) + '</span></div>' +
    '<div class="matchup"><strong class="home">' + esc(match.home) + '</strong>' + score +
    '<strong class="away">' + esc(match.away) + '</strong></div>' +
    '<div class="match-foot"><span><b class="time">' + esc(timing) + '</b><span class="field">' +
    esc(fieldName(data.fields, match.field)) + '</span></span><span><b class="match-state' +
    (scored ? ' finished">' + (match.winnerSide ? 'ชนะ ' + esc(match[match.winnerSide]) : 'เสมอ') : '">รอแข่งขัน') + '</b><span class="stage">' + esc(stage) +
    '</span></span></div></article>';
}

function sportButtons(id) {
  return '<div class="sport-filters" role="group" aria-label="กรองตามกีฬา">' +
    Object.entries({'': 'ทุกกีฬา', ...SPORTS}).map(([sport, label]) =>
      '<button type="button" class="control-button" data-sport-filter="' + id + '" data-sport="' + sport +
      '" aria-pressed="' + (filters[id] === sport) + '">' +
      (sport ? '<span aria-hidden="true">' + sportIcons[sport] + '</span> ' : '') + label + '</button>').join('') + '</div>';
}

function dayButtons() {
  return '<div class="days" role="group" aria-label="วันแข่งขัน">' + Object.entries(DAYS).map(([day, label]) =>
    '<button class="control-button" type="button" data-day="' + day + '" aria-pressed="' +
    (Number(day) === filters.day) + '">' + label + '</button>').join('') + '</div>';
}

function overview() {
  const matches = ordered(data.matches);
  const scored = matches.filter(hasScore);
  const selected = matches.filter(match => !filters.sport || match.sport === filters.sport);
  const upcoming = selected.filter(match => match.day === filters.day && !hasScore(match));
  const latest = selected.filter(hasScore).reverse().slice(0, 3);
  const firstSlot = upcoming.filter(match => match.start === upcoming[0]?.start);
  const distinct = [...new Set(firstSlot.map(match => match.sport))]
    .map(sport => firstSlot.find(match => match.sport === sport));
  const previewMatches = [...distinct, ...upcoming.filter(match => !distinct.includes(match))].slice(0, 3);
  const cards = [
    ['📋', 'โปรแกรม ' + DAYS[filters.day], matches.filter(match => match.day === filters.day).length, 'คู่'],
    ['🏆', 'ประกาศผลแล้ว', scored.length, 'คู่'],
    ['🏫', 'โรงเรียนในเครือข่าย', data.schools.length, 'โรงเรียน'],
    ['🏐', 'ชนิดกีฬา', new Set(matches.map(match => match.sport)).size, 'ชนิด'],
  ].map(([icon, label, count, unit]) =>
    '<div class="metric"><span class="metric-icon" aria-hidden="true">' + icon + '</span><div>' +
    '<div class="metric-label">' + label + '</div><strong>' + count + '</strong> <small>' + unit + '</small></div></div>').join('');
  const list = (matches, empty, scored) => matches.length ?
    '<div class="overview-list">' + matches.map(match => overviewFixture(match, scored)).join('') + '</div>' :
    '<p class="empty">' + empty + '</p>';
  const tableSport = filters.sport || filters.tableSport;
  const groups = standings(data.matches, tableSport);
  const group = groups.find(group => group.rows.some(row => row.played)) || groups[0];
  const preview = group ? '<div class="table-scroll"><table class="mini-table"><caption>' +
    esc(SPORTS[group.match.sport]) + ' · ' + esc(LEVELS[group.match.level]) + esc(TYPES[group.match.type]) +
    (group.match.group ? ' · สาย ' + esc(group.match.group) : ' · พบกันหมด') +
    '</caption><thead><tr><th>อันดับ</th><th>ทีม</th><th>แข่ง</th><th>ชนะ</th><th>คะแนน</th></tr></thead><tbody>' +
    group.rows.slice(0, 5).map(row => '<tr><td>' + (row.played ? row.rank : '–') + '</td><td>' + esc(row.name) +
    '</td><td>' + row.played + '</td><td>' + row.wins + '</td><td>' + row.points + '</td></tr>').join('') +
    '</tbody></table></div>' : '<p class="empty">ยังไม่มีตารางคะแนนในชนิดกีฬานี้</p>';
  return '<div class="metrics" aria-label="สรุปการแข่งขัน">' + cards + '</div>' +
    '<div class="overview-filters"><span>เลือกผลตามชนิดกีฬา</span>' + sportButtons('sport') + '</div>' +
    '<div class="overview-grid">' +
    '<section class="overview-panel" aria-labelledby="latest-title"><div class="section-heading">' +
    '<h2 id="latest-title"><span aria-hidden="true">🏆</span> ผลการแข่งขันล่าสุด</h2><a href="#results" data-results-link>ดูทั้งหมด <span aria-hidden="true">›</span></a></div>' +
    list(latest, 'ยังไม่มีผลการแข่งขันที่เผยแพร่', true) + '</section>' +
    '<section class="overview-panel" aria-labelledby="points-title"><div class="section-heading">' +
    '<h2 id="points-title"><span aria-hidden="true">📊</span> ตารางคะแนน</h2><a href="#standings" data-standings-link>ดูรายละเอียด <span aria-hidden="true">›</span></a></div>' +
    preview + '</section>' +
    '<section class="overview-panel" aria-labelledby="upcoming-title"><div class="section-heading">' +
    '<h2 id="upcoming-title"><span aria-hidden="true">📋</span> โปรแกรมการแข่งขัน</h2><a href="#schedule" data-schedule-link>ดูทั้งหมด <span aria-hidden="true">›</span></a></div>' +
    dayButtons() + list(previewMatches, 'ไม่มีคู่ที่รอแข่งขันตามตัวกรองนี้', false) + '</section></div>';
}

function overviewFixture(match, scored) {
  const round = STAGES[match.stage] + (match.group ? ' · สาย ' + match.group : '');
  const badge = '<b class="sport-badge"><span aria-hidden="true">' + sportIcons[match.sport] + '</span> ' + esc(SPORTS[match.sport]) + '</b>';
  const matchup = '<div class="matchup"><strong class="home">' + esc(match.home) + '</strong>' +
    (scored ? '<strong class="score">' + esc(match.homeScore) + ' – ' + esc(match.awayScore) + '</strong>' :
      '<span class="versus">พบ</span>') + '<strong class="away">' + esc(match.away) + '</strong></div>';
  const meta = badge + '<span>' + esc(LEVELS[match.level]) + esc(TYPES[match.type]) + ' · ' + esc(round) + '</span>';
  const timing = scored ? '<span>' + esc(DAYS[match.day]) + ' ' + esc(match.start) + ' น.</span>' : '';
  return '<article class="match-card compact ' + esc(match.sport) + (scored ? ' compact-result' : ' compact-schedule') + '">' +
    (scored ? '' : '<div class="compact-time"><b>◷ ' + esc(match.start) + ' น.</b><small>' +
      esc(fieldName(data.fields, match.field)) + '</small></div>') +
    '<div class="compact-details"><div class="compact-meta">' + meta + timing + '</div>' + matchup + '</div></article>';
}

function schedule() {
  const activeQuery = filters.query.toLocaleLowerCase('th');
  const matches = ordered(data.matches.filter(match => (activeQuery ?
    [match.home, match.away, match.id].some(value => String(value).toLocaleLowerCase('th').includes(activeQuery)) :
    match.day === filters.day) &&
    (!filters.sport || filters.sport === match.sport) &&
    (!filters.level || filters.level === match.level) &&
    (!filters.type || filters.type === match.type)));
  const cards = matches.length ? '<div class="fixture-grid">' + matches.map(match => matchCard(match, {showDay: Boolean(activeQuery)})).join('') + '</div>' :
    '<p class="empty">' + (data.matches.length ? 'ไม่มีคู่แข่งขันตามตัวกรองนี้' : 'ยังไม่มีโปรแกรมแข่งที่เผยแพร่') + '</p>';

  return '<section aria-labelledby="schedule-title"><div class="section-heading">' +
    '<h2 id="schedule-title">โปรแกรมแข่ง</h2><small>' + (activeQuery ? 'ค้นหา ' + esc(filters.query) : DAYS[filters.day]) + ' · ' + matches.length + ' คู่</small></div>' +
    '<div class="filter-panel">' + (activeQuery ? '<button type="button" class="control-button" data-clear-search>ล้างการค้นหา</button>' : dayButtons()) +
    sportButtons('sport') + '<div class="filters">' +
    select('level', 'รุ่น', LEVELS, 'ทุกรุ่น') + select('type', 'ประเภท', TYPES, 'ทุกประเภท') +
    '</div></div>' + cards + '</section>';
}

function results() {
  const scores = ordered(data.matches.filter(match =>
    hasScore(match) && (!filters.resultSport || match.sport === filters.resultSport))).reverse();
  return '<section aria-labelledby="results-title"><div class="section-heading"><h2 id="results-title">ผลการแข่งขัน</h2>' +
    '<small>' + scores.length + ' คู่ที่มีผล</small></div><div class="filter-panel">' +
    sportButtons('resultSport') + '</div>' +
    (scores.length ? '<div class="fixture-grid">' + scores.map(match => matchCard(match, {showDay: true})).join('') + '</div>' :
      '<p class="empty">ยังไม่มีผลการแข่งขันที่เผยแพร่</p>') +
    '<p class="standings-note"><a href="#standings">ดูตารางคะแนน</a></p></section>';
}

function points() {
  const groups = standings(data.matches, filters.tableSport);
  const tables = groups.map(({match, rows}) => {
    const lines = rows.map(row => '<tr><td>' + (row.played ? row.rank : '–') + '</td><td>' + esc(row.name) + '</td><td>' + row.played +
      '</td><td>' + row.wins + '</td><td>' + row.ties + '</td><td>' + row.losses + '</td><td>' + row.points + '</td></tr>');
    return '<h3>' + esc(LEVELS[match.level]) + ' ' + esc(TYPES[match.type]) + (match.group ? ' · กลุ่ม ' + esc(match.group) : ' · พบกันหมด') +
      '</h3><div class="table-scroll"><table><thead><tr><th>อันดับ</th><th>ทีม</th><th>แข่ง</th><th>ชนะ</th><th>เสมอ</th><th>แพ้</th><th>คะแนน</th></tr></thead><tbody>' +
      lines.join('') + '</tbody></table></div>';
  });

  const qualifierLines = (data.qualifiers || []).filter(q => filters.tableSport === q.sport).map(q => '<li>' +
    esc(LEVELS[q.level]) + ' · ' + esc(TYPES[q.type]) + ' · ' +
    (q.pendingTie ? 'รอผลตัดสินอันดับกรณีสถิติเท่ากัน' : esc(q.team) + ' (สาย ' + esc(q.group) + ')') + '</li>');
  const qualifierPanel = qualifierLines.length ? '<div class="table-panel"><h3>รองแชมป์สายที่ดีที่สุด</h3><ul>' +
    qualifierLines.join('') + '</ul></div>' : '';

  return '<section aria-labelledby="standings-title"><div class="section-heading"><h2 id="standings-title">ตารางคะแนน</h2></div>' +
    '<div class="filter-panel">' + select('tableSport', 'ชนิดกีฬา', SPORTS) + '</div>' +
    qualifierPanel + (tables.length ? '<div class="table-panel"><p>ฟุตบอลชนะ 3 คะแนน เสมอ 1 คะแนน กีฬาอื่นนับจำนวนชนะ แล้วเทียบผลต่างและคะแนนที่ทำได้</p>' +
      tables.join('') + '</div>' : '<p class="empty">ยังไม่มีตารางคะแนนในชนิดกีฬานี้</p>') + '</section>';
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
  navigation.querySelectorAll('a').forEach(link => {
    if (link.hash === '#' + route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  document.body.dataset.view = route;
  if (data) content.innerHTML = {home: overview, schedule, results, standings: points, venues}[route]();
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
    if (changed) render();
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

content.addEventListener('click', event => {
  if (event.target.closest('[data-results-link]')) filters.resultSport = filters.sport;
  if (event.target.closest('[data-standings-link]') && filters.sport) filters.tableSport = filters.sport;
  if (event.target.closest('[data-schedule-link], [data-clear-search]')) {
    filters.query = '';
    search.reset();
    if (event.target.closest('[data-clear-search]')) render();
  }
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
  if (view() === 'home') window.scrollTo(0, 0);
  else competition.scrollIntoView({block: 'start'});
});
search.addEventListener('submit', event => {
  event.preventDefault();
  filters.query = search.elements.query.value.trim();
  Object.assign(filters, {sport: '', level: '', type: ''});
  if (view() === 'schedule') {
    render();
    competition.scrollIntoView({block: 'start'});
  } else location.hash = 'schedule';
});
reload.addEventListener('click', refresh);
render();
refresh();
window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
