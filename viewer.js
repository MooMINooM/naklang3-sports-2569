import {readSports} from './sports-api.js';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, options, standings,
} from './sports-data.js?v=20261117-bracket';

const content = document.getElementById('competition-content');
const search = document.getElementById('team-search');
const status = document.getElementById('sync');
const error = document.getElementById('connection-error');
const sports = Object.keys(SPORTS);
const routes = ['home', 'schedule', 'results', 'standings', 'venues'];
const sportTabs = {schedule: 'โปรแกรมแข่ง', results: 'ผลการแข่งขัน', teams: 'ทีมและสาย'};
const icons = {football: '⚽', volleyball: '🏐', takraw: '', petanque: ''};
let data;
let pending = false;

function readRoute() {
  const [path, query] = location.hash.slice(1).split('?');
  const [page, sport, tab] = path.split('/');
  const params = new URLSearchParams(query);
  return {
    page: page === 'sport' && sports.includes(sport) ? 'sport' : routes.includes(page) ? page : 'home',
    sport: sports.includes(sport) ? sport : sports.includes(params.get('sport')) ? params.get('sport') : '',
    tab: Object.hasOwn(sportTabs, tab) ? tab : 'schedule',
    day: params.get('day') === '0' && (page === 'schedule' || page === 'sport') ? '0' :
      Object.hasOwn(DAYS, params.get('day')) ? params.get('day') : '1',
    level: Object.hasOwn(LEVELS, params.get('level')) ? params.get('level') : '',
    type: Object.hasOwn(TYPES, params.get('type')) ? params.get('type') : '',
    query: (params.get('q') || '').slice(0, 100).trim(),
  };
}

function link(page, state = {}) {
  const path = page === 'sport' ? 'sport/' + state.sport + '/' + (state.tab || 'schedule') : page;
  const params = new URLSearchParams();
  if (state.day && state.day !== '1') params.set('day', state.day);
  if (state.sport && page !== 'sport' && page !== 'home') params.set('sport', state.sport);
  for (const key of ['level', 'type']) if (state[key]) params.set(key, state[key]);
  if (state.query) params.set('q', state.query);
  return '#' + path + (params.size ? '?' + params : '');
}

function sportIcon(sport) {
  return '<span class="sport-icon ' + sport + '" aria-hidden="true">' + icons[sport] + '</span>';
}

function sportNav(active = '', tab = 'schedule') {
  return '<nav class="sport-nav" aria-label="เลือกชนิดกีฬา">' + sports.map(sport =>
    '<a class="sport-link ' + sport + '" href="' + esc(link('sport', {sport, tab})) + '"' +
    (active === sport ? ' aria-current="page"' : '') + '>' + sportIcon(sport) +
    '<span>' + SPORTS[sport] + '</span><span class="arrow" aria-hidden="true">›</span></a>').join('') + '</nav>';
}

function dayNav(route, all = false) {
  const days = all ? {'0': 'ทุกวัน', ...DAYS} : DAYS;
  return '<nav class="day-nav" aria-label="วันแข่งขัน">' + Object.entries(days).map(([day, label]) => {
    const target = link(route.page, {...route, day});
    return '<a class="pill" href="' + esc(target) + '"' + (day === route.day ? ' aria-current="true"' : '') + '>' + label + '</a>';
  }).join('') + '</nav>';
}

function select(id, label, values, value, placeholder) {
  return '<label for="' + id + '">' + label + '<select id="' + id + '" name="' + id + '">' +
    options(values, value, placeholder) + '</select></label>';
}

function filters(route, {days = false, sport = false} = {}) {
  return '<div class="filters">' + (days ? dayNav(route, Boolean(route.query)) : '') +
    '<div class="selects">' + (sport ? select('sport', 'กีฬา', SPORTS, route.sport, 'ทุกกีฬา') : '') +
    select('level', 'รุ่น', LEVELS, route.level, 'ทุกรุ่น') +
    select('type', 'ประเภท', TYPES, route.type, 'ทุกประเภท') + '</div></div>';
}

function heading(title, description = '') {
  return '<div class="page-heading"><h1>' + esc(title) + '</h1>' +
    (description ? '<p>' + esc(description) + '</p>' : '') + '</div>';
}

function empty(message, action = '') {
  return '<div class="empty"><p>' + esc(message) + '</p>' + action + '</div>';
}

function badge(sport) {
  return '<span class="sport-badge">' + sportIcon(sport) + SPORTS[sport] + '</span>';
}

function seasonLabel(match) {
  return LEVELS[match.level] + TYPES[match.type] + ' · ' +
    (match.group ? 'สาย ' + match.group : STAGES[match.stage]);
}

function matchup(match, scored) {
  const scores = scored ? '<span class="score" role="img" aria-label="คะแนน ' + esc(match.homeScore) + ' ต่อ ' +
    esc(match.awayScore) + '">' + esc(match.homeScore) + '<span aria-hidden="true">–</span>' + esc(match.awayScore) + '</span>' :
    '<span class="versus">พบ</span>';
  return '<div class="matchup"><strong class="team' + (match.winnerSide === 'home' ? ' winner' : '') +
    '">' + esc(match.home) + '</strong>' + scores + '<strong class="team' +
    (match.winnerSide === 'away' ? ' winner' : '') + '">' + esc(match.away) + '</strong></div>';
}

function fixture(match, compact = false) {
  const scored = hasScore(match);
  const end = clock(minutes(match.start) + duration(match, data.settings));
  const time = esc(match.start) + '–' + esc(end) + ' น.';
  const when = scored ? esc(DAYS[match.day]) + ' · ' + time : time;
  const venue = esc(fieldName(data.fields, match.field));
  const outcome = match.winnerSide ? 'ชนะ ' + esc(match[match.winnerSide]) : 'เสมอ';
  const state = scored ? '<span class="match-state played">' + outcome + '</span>' :
    match.ready === false ? '<span class="match-state">รอผลจับสลากหรือรอบก่อนหน้า</span>' : '';
  if (compact && !scored) {
    return '<article class="fixture preview-match ' + match.sport + '"><div class="preview-when">' +
      '<strong class="fixture-time">' + time + '</strong><span>' + venue + '</span></div>' +
      '<div class="preview-matchup"><div class="fixture-meta">' + badge(match.sport) + '<span>' +
      esc(seasonLabel(match)) + '</span></div>' + matchup(match, false) + '</div></article>';
  }
  return '<article class="fixture ' + match.sport + '"><div class="fixture-meta">' + badge(match.sport) +
    '<span>' + esc(seasonLabel(match)) + '</span></div>' + matchup(match, scored) +
    '<div class="fixture-foot"><span class="fixture-time">' + when + '</span><span>' + venue + '</span>' +
    state + '</div></article>';
}

function scheduleGroups(matches, showDay) {
  const slots = new Map();
  for (const match of matches) {
    const key = match.day + '|' + match.start;
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push(match);
  }
  return '<div class="timeslots">' + [...slots.values()].map(group => {
    const first = group[0];
    return '<section class="timeslot"><h2>' + (showDay ? '<small class="slot-day">' + DAYS[first.day] + '</small>' : '') +
      esc(first.start) + ' <small>น.</small></h2><div class="fixtures">' +
      group.map(match => fixture(match)).join('') + '</div></section>';
  }).join('') + '</div>';
}

function position(a, b) {
  return Object.keys(LEVELS).indexOf(a.match.level) - Object.keys(LEVELS).indexOf(b.match.level) ||
    Object.keys(TYPES).indexOf(a.match.type) - Object.keys(TYPES).indexOf(b.match.type) ||
    a.match.group.localeCompare(b.match.group);
}

function groupCards(matches, sport, compact = false) {
  const groups = standings(matches, sport).sort(position);
  if (!groups.length) return empty('ยังไม่มีรายชื่อทีมในรายการนี้');
  const visible = compact ? [groups.find(group => group.rows.some(row => row.played)) || groups[0]] : groups;
  return '<div class="group-grid">' + visible.map(({match, rows}) => {
    const played = rows.some(row => row.played);
    const title = LEVELS[match.level] + TYPES[match.type] + ' · ' +
      (match.group ? 'สาย ' + match.group : 'พบกันหมด');
    const label = compact ? SPORTS[sport] + ' · ' + title : title;
    return '<section class="group-card ' + sport + '"><h3>' + esc(label) + '</h3>' + (played ?
      '<div class="table-scroll"><table aria-label="' + esc(label) + '"><thead><tr><th scope="col">อันดับ</th>' +
      '<th scope="col">ทีม</th><th scope="col">แข่ง</th><th scope="col">ชนะ</th>' +
      (compact ? '' : '<th scope="col">เสมอ</th><th scope="col">แพ้</th>') +
      '<th scope="col">คะแนน</th></tr></thead><tbody>' +
      rows.map(row => '<tr><td>' + (row.played ? row.rank : '–') + '</td><th scope="row">' + esc(row.name) +
        '</th><td>' + row.played + '</td><td>' + row.wins + '</td>' +
        (compact ? '' : '<td>' + row.ties + '</td><td>' + row.losses + '</td>') +
        '<td><strong>' + row.points + '</strong></td></tr>').join('') + '</tbody></table></div>' :
      '<ul class="team-list">' + rows.map(row => '<li>' + esc(row.name) + '</li>').join('') + '</ul>') + '</section>';
  }).join('') + '</div>';
}

function qualifiers(route) {
  const rows = (data.qualifiers || []).filter(row => row.sport === route.sport &&
    (!route.level || route.level === row.level) && (!route.type || route.type === row.type));
  return rows.length ? '<section class="qualifiers"><h2>รองแชมป์สายผลงานดีที่สุด</h2><ul>' + rows.map(row =>
    '<li>' + esc(LEVELS[row.level] + TYPES[row.type]) + ' · ' +
    (row.pendingTie ? 'รอผลตัดสินอันดับ' : esc(row.team) + ' (สาย ' + esc(row.group) + ')') + '</li>').join('') +
    '</ul></section>' : '';
}

function panel(title, icon, href, action, body, className) {
  return '<section class="panel ' + className + '"><div class="panel-title"><h2><span aria-hidden="true">' +
    icon + '</span>' + title + '</h2><a href="' + esc(href) + '">' + action + ' <span aria-hidden="true">›</span></a></div>' + body + '</section>';
}

function homepage(route) {
  const matches = ordered(data.matches);
  const scores = matches.filter(hasScore);
  const day = matches.filter(match => String(match.day) === route.day);
  const unscored = day.filter(match => !hasScore(match));
  const featured = unscored.length ? unscored : day;
  const selection = [];
  const seen = new Set();
  for (const match of featured) {
    if (seen.has(match.sport)) continue;
    seen.add(match.sport);
    selection.push(match);
  }
  const preview = ordered([...selection, ...featured.filter(match => !selection.includes(match))].slice(0, 4));
  const metrics = [
    ['📋', 'โปรแกรม ' + DAYS[route.day], day.length, 'คู่', link('schedule', {day: route.day})],
    ['🏆', 'ประกาศผลแล้ว', scores.length, 'คู่', '#results'],
    ['🏫', 'โรงเรียนในเครือข่าย', data.schools.length, 'โรงเรียน', '#venues'],
    ['🏐', 'ชนิดกีฬา', new Set(matches.map(match => match.sport)).size, 'ชนิด', '#sport-navigation'],
  ];
  const selectedSport = scores.at(-1)?.sport || 'football';
  const miniTeams = groupCards(matches, selectedSport, true);
  return '<div class="metrics">' + metrics.map(([icon, label, count, unit, href]) =>
    '<a class="metric" href="' + esc(href) + '"><span class="metric-icon" aria-hidden="true">' + icon +
    '</span><span class="metric-text"><span>' + label + '</span><strong>' + count +
    '</strong> <small>' + unit + '</small></span></a>').join('') + '</div>' +
    '<section id="sport-navigation" tabindex="-1" class="sport-selector" aria-label="โปรแกรมแยกตามกีฬา">' +
    '<h2>เลือกชนิดกีฬา</h2>' + sportNav() + '</section><div class="home-panels">' +
    panel('โปรแกรมแข่ง', '📋', link('schedule', {day: route.day}), 'ดูโปรแกรมทั้งหมด', dayNav(route) +
      (preview.length ? '<div class="preview-fixtures">' + preview.map(match => fixture(match, true)).join('') + '</div>' :
        empty('ยังไม่มีโปรแกรมในวันนี้')), 'schedule-panel') +
    panel(scores.length ? 'ตารางคะแนน' : 'ทีมและสาย', '📊', link('standings', {sport: selectedSport}), 'ดูทุกสาย',
      miniTeams, 'teams-panel') +
    panel('ผลการแข่งขัน', '🏆', '#results', 'ดูผลทั้งหมด', scores.length ?
      '<div class="preview-fixtures">' + scores.slice(-3).reverse().map(match => fixture(match, true)).join('') + '</div>' :
      empty('ยังไม่มีผลการแข่งขันที่เผยแพร่'), 'results-panel') + '</div>';
}

function filtered(route) {
  return data.matches.filter(match => (!route.sport || match.sport === route.sport) &&
    (!route.level || match.level === route.level) && (!route.type || match.type === route.type));
}

function schedule(route) {
  const query = route.query.toLocaleLowerCase('th');
  const matches = ordered(filtered(route).filter(match => (route.day === '0' || String(match.day) === route.day) &&
    (!query || [match.home, match.away, match.id].some(value => String(value).toLocaleLowerCase('th').includes(query)))));
  const label = (route.query ? 'ค้นหา “' + route.query + '” · ' : '') +
    (route.day === '0' ? 'ทุกวัน' : DAYS[route.day]) + ' · ' + matches.length + ' คู่';
  return (route.page === 'sport' ? '<h2 class="list-heading">โปรแกรมแข่ง</h2><p class="list-count">' + esc(label) + '</p>' :
    heading('โปรแกรมแข่ง', label)) + (route.query ? '<a class="clear-link" href="' +
    esc(link(route.page, {...route, query: '', day: '1'})) + '">ล้างการค้นหา</a>' : '') +
    filters(route, {days: true, sport: route.page !== 'sport'}) +
    (matches.length ? scheduleGroups(matches, route.day === '0') : empty('ไม่มีคู่แข่งขันตามตัวกรองนี้'));
}

function results(route) {
  const scores = ordered(filtered(route).filter(hasScore)).reverse();
  return (route.page === 'sport' ? '<h2 class="list-heading">ผลการแข่งขัน</h2>' :
    heading('ผลการแข่งขัน', scores.length + ' คู่ที่ประกาศผลแล้ว')) +
    filters(route, {sport: route.page !== 'sport'}) +
    (scores.length ? '<div class="fixtures result-list">' + scores.map(match => fixture(match)).join('') + '</div>' :
      empty('ยังไม่มีผลการแข่งขันที่เผยแพร่ตามตัวกรองนี้'));
}

function teamPage(route) {
  const sport = route.sport || 'football';
  return (route.page === 'sport' ? '<h2 class="list-heading">ทีมและสาย</h2>' :
    heading('ทีม สาย และตารางคะแนน') + sportNav(sport, 'teams')) +
    filters({...route, sport}) + qualifiers({...route, sport}) + groupCards(filtered({...route, sport}), sport);
}

function sportPage(route) {
  const active = sportTabs[route.tab];
  return '<div class="sport-heading ' + route.sport + '">' + sportIcon(route.sport) +
    '<div><h1>' + SPORTS[route.sport] + '</h1></div></div>' + sportNav(route.sport, route.tab) +
    '<nav class="sport-tabs" aria-label="ข้อมูลการแข่งขัน' + SPORTS[route.sport] + '">' +
    Object.entries(sportTabs).map(([tab, label]) => '<a href="' +
      esc(link('sport', {...route, tab, query: '', day: '1'})) + '"' + (active === label ? ' aria-current="page"' : '') +
      '>' + label + '</a>').join('') + '</nav>' +
    {schedule, results, teams: teamPage}[route.tab](route);
}

function venues() {
  return heading('โรงเรียนและสนาม') + '<div class="directory"><section class="group-card"><h2>โรงเรียนในเครือข่าย</h2>' +
    '<ul class="team-list">' + data.schools.map(name => '<li>' + esc(name) + '</li>').join('') +
    '</ul></section><section class="group-card"><h2>สนามแข่งขัน</h2><ul class="venue-list">' +
    data.fields.map(field => '<li>' + badge(field.sport) + '<div><strong>' + esc(field.name) + '</strong><small>' +
      esc(field.levels.split(',').map(level => LEVELS[level]).filter(Boolean).join(' · ')) + '</small></div></li>').join('') +
    '</ul></section></div>';
}

function render(syncSearch = true) {
  const route = readRoute();
  document.body.dataset.page = route.page;
  if (syncSearch) search.elements.query.value = route.query;
  document.querySelectorAll('.main-nav a').forEach(item => {
    if (item.hash === '#' + route.page) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  if (data) content.innerHTML = {home: homepage, schedule, results, standings: teamPage, venues, sport: sportPage}[route.page](route);
}

async function refresh() {
  if (pending) return;
  pending = true;
  try {
    const next = await readSports();
    const changed = JSON.stringify(next) !== JSON.stringify(data);
    data = next;
    status.dataset.state = 'connected';
    status.textContent = 'อัปเดต ' + new Date().toLocaleTimeString('th-TH',
      {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'}) + ' น.';
    error.hidden = true;
    if (changed) render(false);
  } catch (failure) {
    status.dataset.state = 'failed';
    status.textContent = 'เชื่อมต่อข้อมูลไม่ได้';
    document.getElementById('error-message').textContent = failure.message;
    error.hidden = false;
    if (!data) content.replaceChildren();
  } finally {
    pending = false;
  }
}

function updateFilters(next, focusSelector) {
  const url = link(next.page, next);
  history.pushState(null, '', url);
  render();
  if (focusSelector) content.querySelector(focusSelector)?.focus({preventScroll: true});
}

content.addEventListener('change', event => {
  const {name, value} = event.target;
  if (!['sport', 'level', 'type'].includes(name)) return;
  updateFilters({...readRoute(), [name]: value}, '#' + name);
});
content.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (event.target.closest('a[href="#sport-navigation"]')) {
    event.preventDefault();
    const sportsSection = document.getElementById('sport-navigation');
    sportsSection.focus({preventScroll: true});
    sportsSection.scrollIntoView();
    return;
  }
  const day = event.target.closest('.day-nav a');
  if (!day) return;
  event.preventDefault();
  history.pushState(null, '', day.href);
  render();
  content.querySelector('.day-nav [aria-current]')?.focus({preventScroll: true});
});
window.addEventListener('hashchange', () => {
  if (['#content', '#sport-navigation'].includes(location.hash)) return;
  render();
  window.scrollTo(0, 0);
});
window.addEventListener('popstate', () => render());
search.addEventListener('submit', event => {
  event.preventDefault();
  const query = search.elements.query.value.trim();
  const target = link('schedule', {query, day: query ? '0' : '1'});
  history.pushState(null, '', target);
  render();
  document.getElementById('content').focus();
  window.scrollTo(0, 0);
});
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  document.getElementById('content').focus();
});
document.getElementById('reload').addEventListener('click', refresh);
render();
refresh();
window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
