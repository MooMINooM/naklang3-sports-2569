import {readSports} from './sports-api.js';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, options, standings, usesSets,
} from './sports-data.js?v=20261118-school-logos';

const content = document.getElementById('competition-content');
const search = document.getElementById('team-search');
const status = document.getElementById('sync');
const error = document.getElementById('connection-error');
const sports = Object.keys(SPORTS);
const routes = ['home', 'schedule', 'results', 'standings', 'schools', 'venues'];
const sportTabs = {schedule: 'โปรแกรมแข่ง', results: 'ผลการแข่งขัน', teams: 'ทีมและสาย'};
const icons = {football: '⚽', volleyball: '🏐', takraw: '', petanque: ''};
let data;
let pending = false;

function readRoute() {
  const [path, query] = location.hash.slice(1).split('?');
  const [page, sport, subsection, division, divisionTab] = path.split('/');
  const params = new URLSearchParams(query);
  const dedicated = page === 'sport' && Object.hasOwn(LEVELS, subsection) && Object.hasOwn(TYPES, division);
  const tab = dedicated ? divisionTab : subsection;
  return {
    page: page === 'sport' && sports.includes(sport) ? 'sport' : routes.includes(page) ? page : 'home',
    sport: sports.includes(sport) ? sport : sports.includes(params.get('sport')) ? params.get('sport') : '',
    tab: Object.hasOwn(sportTabs, tab) ? tab : 'schedule',
    day: params.get('day') === '0' && (page === 'schedule' || page === 'sport') ? '0' :
      Object.hasOwn(DAYS, params.get('day')) ? params.get('day') : '1',
    dedicated,
    level: dedicated ? subsection : Object.hasOwn(LEVELS, params.get('level')) ? params.get('level') : '',
    type: dedicated ? division : Object.hasOwn(TYPES, params.get('type')) ? params.get('type') : '',
    query: (params.get('q') || '').slice(0, 100).trim(),
    school: (params.get('school') || '').slice(0, 100).trim(),
  };
}

function link(page, state = {}) {
  const division = page === 'sport' && state.dedicated ? state.level + '/' + state.type + '/' : '';
  const path = page === 'sport' ? 'sport/' + state.sport + '/' + division + (state.tab || 'schedule') : page;
  const params = new URLSearchParams();
  if (state.day && state.day !== '1') params.set('day', state.day);
  if (state.sport && page !== 'sport' && page !== 'home') params.set('sport', state.sport);
  for (const key of ['level', 'type']) if (!division && state[key]) params.set(key, state[key]);
  if (state.query) params.set('q', state.query);
  if (page === 'schools' && state.school) params.set('school', state.school);
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
  if (route.dedicated) return days ? '<div class="filters">' + dayNav(route, Boolean(route.query)) + '</div>' : '';
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

function signed(value) {
  return value > 0 ? '+' + value : value < 0 ? '−' + Math.abs(value) : '0';
}

function schoolMark(name) {
  const raw = Object.hasOwn(data.schoolLogos || {}, name) ? data.schoolLogos[name] : '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && !url.username && !url.password) {
      return '<img class="school-mark" src="' + esc(url.href) + '" alt="" width="28" height="28" loading="lazy" referrerpolicy="no-referrer">';
    }
  } catch (error) {
    return '';
  }
  return '';
}

function schoolName(name) {
  return '<span class="school-name">' + schoolMark(name) + '<span>' + esc(name) + '</span></span>';
}

function resultCard(match) {
  const tiebreak = match.winnerSide && match.homeScore === match.awayScore;
  return '<article class="result-card ' + match.sport + '">' + matchup(match, true) +
    (tiebreak ? '<small>ชนะในการตัดสิน · ' + esc(match[match.winnerSide]) + '</small>' : '') + '</article>';
}

function matchup(match, scored) {
  const scores = scored ? '<span class="score" role="img" aria-label="คะแนน ' + esc(match.homeScore) + ' ต่อ ' +
    esc(match.awayScore) + '">' + esc(match.homeScore) + '<span aria-hidden="true">–</span>' + esc(match.awayScore) + (usesSets(match.sport) ? '<small aria-hidden="true">เซต</small>' : '') + '</span>' :
    '<span class="versus">พบ</span>';
  return '<div class="matchup"><strong class="team' + (match.winnerSide === 'home' ? ' winner' : '') +
    '">' + schoolName(match.home) + '</strong>' + scores + '<strong class="team' +
    (match.winnerSide === 'away' ? ' winner' : '') + '">' + schoolName(match.away) + '</strong></div>';
}

function fixture(match, compact = false) {
  const scored = hasScore(match);
  const end = clock(minutes(match.start) + duration(match));
  const time = esc(match.start) + '–' + esc(end) + ' น.';
  const when = scored ? esc(DAYS[match.day]) + ' · ' + time : time;
  const venue = esc(fieldName(data.fields, match.field));
  const state = !scored && match.ready === false ? '<span class="match-state">รอผลจับสลากหรือรอบก่อนหน้า</span>' : '';
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
  const [forLabel, againstLabel] = sport === 'football' ? ['ประตูได้', 'ประตูเสีย'] :
    usesSets(sport) ? ['เซตได้', 'เซตเสีย'] : ['แต้มได้', 'แต้มเสีย'];
  const visible = compact ? [groups.find(group => group.rows.some(row => row.played)) || groups[0]] : groups;
  return '<div class="group-grid">' + visible.map(({match, rows}) => {
    const showTable = !compact || rows.some(row => row.played);
    const showSetPoints = !compact && usesSets(sport);
    const title = LEVELS[match.level] + TYPES[match.type] + ' · ' +
      (match.group ? 'สาย ' + match.group : 'พบกันหมด');
    const label = compact ? SPORTS[sport] + ' · ' + title : title;
    return '<section class="group-card ' + sport + '"><h3>' + esc(label) + '</h3>' + (showTable ?
      '<div class="table-scroll" tabindex="0" role="region" aria-label="เลื่อนดูตารางคะแนน"><table aria-label="' + esc(label) + '"><thead><tr><th scope="col">อันดับ</th>' +
      '<th scope="col">ทีม</th><th scope="col">แข่ง</th><th scope="col">ชนะ</th>' +
      (compact ? '' : '<th scope="col">เสมอ</th><th scope="col">แพ้</th>') +
      '<th scope="col">' + forLabel + '</th><th scope="col">' + againstLabel + '</th><th scope="col">ผลต่าง</th>' +
      (showSetPoints ? '<th scope="col">แต้มได้</th><th scope="col">แต้มเสีย</th>' : '') +
      '<th scope="col">คะแนน</th></tr></thead><tbody>' +
      rows.map(row => '<tr><td>' + (row.played ? row.rank : '–') + '</td><th scope="row">' + schoolName(row.name) +
        '</th><td>' + row.played + '</td><td>' + row.wins + '</td>' +
        (compact ? '' : '<td>' + row.ties + '</td><td>' + row.losses + '</td>') +
        '<td>' + row.goals + '</td><td>' + (row.goals - row.difference) + '</td><td>' +
        signed(row.difference) + '</td>' +
        (showSetPoints ? '<td>' + (row.setMatches ? row.setPoints : '–') + '</td><td>' +
          (row.setMatches ? row.setAgainst : '–') + '</td>' : '') + '<td><strong>' + row.points + '</strong></td></tr>').join('') + '</tbody></table></div>' :
      '<ul class="team-list">' + rows.map(row => '<li>' + schoolName(row.name) + '</li>').join('') + '</ul>') + '</section>';
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
    panel('ผลการแข่งขัน', '🏆', '#results', 'ดูผลทั้งหมด', (scores.length ?
      '<div class="preview-fixtures">' + scores.slice(-3).reverse().map(resultCard).join('') + '</div>' :
      empty('ยังไม่มีผลการแข่งขันที่เผยแพร่')) +
      '<a class="related-link" href="#schools">ดูผลรายโรงเรียน ›</a>', 'results-panel') + '</div>';
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
    heading('ผลการแข่งขัน', scores.length + ' คู่ที่ประกาศผลแล้ว') +
    '<a class="related-link" href="#schools">ดูผลรายโรงเรียน ›</a>') +
    filters(route, {sport: route.page !== 'sport'}) +
    (scores.length ? '<div class="fixtures result-list">' + sports.map(sport => {
      const games = scores.filter(match => match.sport === sport);
      return games.length ? '<section class="sport-results"><h2>' + badge(sport) + '</h2>' +
        games.map(resultCard).join('') + '</section>' : '';
    }).join('') + '</div>' :
      empty('ยังไม่มีผลการแข่งขันที่เผยแพร่ตามตัวกรองนี้'));
}

function teamPage(route) {
  const sport = route.sport || 'football';
  return (route.page === 'sport' ? '<h2 class="list-heading">ทีมและสาย</h2>' :
    heading('ทีม สาย และตารางคะแนน') + sportNav(sport, 'teams')) +
    filters({...route, sport}) + qualifiers({...route, sport}) + groupCards(filtered({...route, sport}), sport);
}

function sportPage(route) {
  const divisionTitle = route.dedicated ? LEVELS[route.level] + TYPES[route.type] : '';
  return '<div class="sport-heading ' + route.sport + '">' + sportIcon(route.sport) +
    '<div><h1>' + SPORTS[route.sport] + (divisionTitle ? ' · ' + divisionTitle : '') + '</h1></div></div>' +
    sportNav(route.sport, route.tab) + divisions(route) +
    '<nav class="sport-tabs" aria-label="ข้อมูลการแข่งขัน' + SPORTS[route.sport] + '">' +
    Object.entries(sportTabs).map(([tab, label]) => '<a href="' +
      esc(link('sport', {...route, tab, query: '', day: '1'})) + '"' + (route.tab === tab ? ' aria-current="page"' : '') +
      '>' + label + '</a>').join('') + '</nav>' +
    {schedule, results, teams: teamPage}[route.tab](route);
}

function divisions(route) {
  const events = new Set(data.matches.filter(match => match.sport === route.sport)
    .map(match => match.level + '/' + match.type));
  const links = Object.keys(LEVELS).flatMap(level => Object.keys(TYPES)
    .filter(type => events.has(level + '/' + type))
    .map(type => {
      const active = route.dedicated && route.level === level && route.type === type;
      return '<a class="division-link" href="' +
        esc(link('sport', {sport: route.sport, tab: route.tab, level, type, dedicated: true})) + '"' +
        (active ? ' aria-current="page"' : '') + '>' + LEVELS[level] + TYPES[type] + '</a>';
    })).join('');
  if (!links) return '';
  return '<nav class="division-nav" aria-label="รุ่นการแข่งขัน"><strong>รุ่นและประเภท</strong><div>' +
    '<a class="division-link" href="' + esc(link('sport', {sport: route.sport, tab: route.tab})) + '"' +
    (!route.dedicated && !route.level && !route.type ? ' aria-current="page"' : '') + '>ทุกรุ่น</a>' + links +
    '</div></nav>';
}

function schoolMatch(match, school) {
  const home = match.home === school;
  const side = home ? 'home' : 'away';
  const own = Number(home ? match.homeScore : match.awayScore);
  const against = Number(home ? match.awayScore : match.homeScore);
  const outcome = match.winnerSide ? (match.winnerSide === side ? 'win' : 'loss') :
    own > against ? 'win' : own < against ? 'loss' : 'draw';
  return {match, own, against, outcome, opponent: home ? match.away : match.home};
}

function schoolStats(games) {
  const counts = {win: 0, draw: 0, loss: 0};
  for (const game of games) counts[game.outcome]++;
  return counts;
}

function schoolResultGroup(sport, games) {
  return '<section class="group-card school-sport ' + sport + '"><h2>' + badge(sport) + '</h2>' +
    '<div class="school-games">' + games.map(({match, own, against, outcome, opponent}) => {
      const tiebreak = match.winnerSide && own === against;
      return '<article class="school-game">' + schoolName(opponent) + '<div class="school-score"><span class="score">' +
        own + ' – ' + against + (usesSets(sport) ? '<small aria-hidden="true">เซต</small>' : '') + '</span>' +
        (tiebreak ? '<small>' + (outcome === 'win' ? 'ชนะ' : 'แพ้') + 'ในการตัดสิน</small>' : '') + '</div></article>';
    }).join('') + '</div></section>';
}

function schoolsPage(route) {
  const names = new Set(data.schools);
  for (const match of data.matches) {
    if (!match.ready) continue;
    names.add(match.home);
    names.add(match.away);
  }
  const schools = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'th'));
  const active = schools.includes(route.school) ? route.school : '';
  const filter = '<div class="filters school-filter"><div class="selects">' +
    select('school', 'โรงเรียน', Object.fromEntries(schools.map(name => [name, name])), active, 'เลือกโรงเรียน') +
    '</div></div>';
  if (!active) {
    return heading('ผลการแข่งขันรายโรงเรียน') + filter +
      '<div class="school-directory">' + schools.map(name => '<a href="' + esc(link('schools', {school: name})) +
      '">' + schoolName(name) + ' <span aria-hidden="true">›</span></a>').join('') + '</div>';
  }
  const all = ordered(data.matches.filter(match => match.home === active || match.away === active));
  const games = all.filter(hasScore).reverse().map(match => schoolMatch(match, active));
  const stats = schoolStats(games);
  const program = all.length ? '<a class="related-link" href="' +
    esc(link('schedule', {query: active, day: '0'})) + '">ดูโปรแกรมของโรงเรียน ›</a>' : '';
  return heading('ผลการแข่งขันรายโรงเรียน') + '<p class="selected-school">' + schoolName(active) + '</p>' + filter + program +
    (games.length ? '<div class="school-summary" aria-label="สรุปผลการแข่งขัน"><span>แข่ง <b>' + games.length +
      '</b></span><span>ชนะ <b>' + stats.win + '</b></span><span>เสมอ <b>' + stats.draw +
      '</b></span><span>แพ้ <b>' + stats.loss + '</b></span></div><div class="group-grid">' +
      sports.map(sport => {
        const items = games.filter(game => game.match.sport === sport);
        return items.length ? schoolResultGroup(sport, items) : '';
      }).join('') + '</div>' : empty('โรงเรียนนี้ยังไม่มีผลการแข่งขันที่เผยแพร่'));
}

function venues() {
  return heading('โรงเรียนและสนาม') + '<div class="directory"><section class="group-card"><h2>โรงเรียนในเครือข่าย</h2>' +
    '<ul class="team-list">' + data.schools.map(name => '<li><a href="' + esc(link('schools', {school: name})) +
      '">' + schoolName(name) + '</a></li>').join('') +
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
  if (data) content.innerHTML = {home: homepage, schedule, results, standings: teamPage, schools: schoolsPage, venues, sport: sportPage}[route.page](route);
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
  if (!['sport', 'level', 'type', 'school'].includes(name)) return;
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
content.addEventListener('error', event => {
  if (event.target.matches('.school-mark')) event.target.hidden = true;
}, true);
document.getElementById('reload').addEventListener('click', refresh);
render();
refresh();
window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
