import {showSimulationNotice} from './simulation-notice.js?v=20261124-score-test';
import {schoolNameMarkup} from './school-label.js?v=20261123-wide-groups';
import {knockoutMarkup} from './knockout.js?v=20261124-friendly';
import {readSports} from './sports-api.js?v=20261123-random-draw';
import {
  SPORTS, LEVELS, TYPES, STAGES, DAYS, escapeHtml as esc, hasScore, duration,
  minutes, clock, ordered, fieldName, standings, usesSets,
} from './sports-data.js?v=20261123-supabase';

const content = document.getElementById('competition-content');
const search = document.getElementById('team-search');
const status = document.getElementById('sync');
const error = document.getElementById('connection-error');
const sports = Object.keys(SPORTS);
const routes = ['home', 'schedule', 'results', 'standings', 'knockout', 'schools', 'venues'];
const sportTabs = {schedule: 'โปรแกรมแข่ง', results: 'ผลการแข่งขัน', teams: 'ทีมและสาย', knockout: 'รอบ 4 ทีมและรอบชิง'};
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
    pageNumber: Math.max(1, Math.min(9999, Number(params.get('p')) || 1)),
    group: params.get('group') || '', round: params.get('round') || 'semi',
    viewAll: params.get('view') === 'all', feed: params.get('feed') === 'schedule' ? 'schedule' : 'results',
    day: params.get('day') === '0' ? '0' :
      Object.hasOwn(DAYS, params.get('day')) ? params.get('day') : (tab === 'results' || page === 'results' ? '0' : '1'),
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
  if (state.day) params.set('day', state.day);
  if (state.pageNumber > 1) params.set('p', state.pageNumber);
  if (state.viewAll) params.set('view', 'all');
  for (const key of ['group', 'round', 'feed']) if (state[key]) params.set(key, state[key]);
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
    const target = link(route.page, {...route, day, pageNumber: 1});
    return '<a class="pill" href="' + esc(target) + '"' + (day === route.day ? ' aria-current="true"' : '') + '>' + label + '</a>';
  }).join('') + '</nav>';
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

function schoolName(name) {
  return schoolNameMarkup(name, data.schoolLogos || {});
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
    state + '</div>' + (scored && Array.isArray(match.scoreSets) && match.scoreSets.length ? '<details class="set-detail"><summary>แต้มรายเซต</summary><p>' + match.scoreSets.map((pair,i) => 'เซต ' + (i+1) + ': ' + pair.map(esc).join('–')).join(' · ') + '</p></details>' : '') + '</article>';
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
  return '<div class="group-grid' + (compact ? '' : ' standings-groups') + '">' + visible.map(({match, rows}) => {
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
          (row.setMatches ? row.setAgainst : '–') + '</td>' : '') + '<td><strong>' + row.points + '</strong></td></tr>').join('') + '</tbody></table></div><div class="mobile-standings">' + rows.map(row => '<article><div class="standing-team"><b>' + (row.played ? row.rank : '–') + '</b>' + schoolName(row.name) + '<strong>' + row.points + '<small>คะแนน</small></strong></div><dl>' + [['แข่ง',row.played],['ชนะ',row.wins],['เสมอ',row.ties],['แพ้',row.losses],[forLabel,row.goals],[againstLabel,row.goals-row.difference],['ผลต่าง',signed(row.difference)],...(showSetPoints ? [['แต้มได้',row.setMatches ? row.setPoints : '–'],['แต้มเสีย',row.setMatches ? row.setAgainst : '–']] : [])].map(([label,value]) => '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('') + '</dl></article>').join('') + '</div>' :
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

function homepage(route) {
  const matches = ordered(data.matches);
  const scores = matches.filter(hasScore);
  const program = route.feed === 'schedule';
  const preview = program ? matches.filter(m => String(m.day) === route.day).slice(0, 2) : scores.slice(-2).reverse();
  return '<section class="welcome"><div><span class="eyebrow">สนามแห่งมิตรภาพ · ปีการศึกษา 2569</span><h1>เชียร์ทุกทีม<br>ติดตามทุกผล</h1><p>โปรแกรม ผลแข่ง และคะแนน ดูง่ายในที่เดียว</p></div></section>' +
    '<section class="sport-selector"><div class="section-title"><h2>เริ่มจากกีฬาที่อยากดู</h2><span>เลือกกีฬา แล้วเลือกรุ่น</span></div>' + sportNav() + '</section>' +
    '<div class="summary-strip"><span><b>' + matches.length + '</b> คู่แข่งขัน</span><span><b>' + scores.length + '</b> คู่ประกาศผล</span><span><b>4</b> วันแห่งความสนุก</span></div>' +
    '<div class="home-layout"><section class="panel"><nav class="feed-tabs" aria-label="ข้อมูลหน้าแรก">' +
    [['results','ผลการแข่งขัน'],['schedule','โปรแกรมแข่ง']].map(([feed,label]) => '<a href="' + esc(link('home',{...route,feed})) + '"' + (route.feed === feed ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>' +
    (program ? dayNav(route) : '<p class="list-count">ผลที่บันทึกแล้ว เรียงตามโปรแกรมล่าสุด</p>') +
    '<div class="preview-fixtures">' + (preview.length ? preview.map(m => fixture(m)).join('') : empty('ยังไม่มีรายการในส่วนนี้')) + '</div><a class="button view-more" href="' + esc(link(program ? 'schedule' : 'results',{viewAll:true,day:program ? route.day : '0'})) + '">ดู' + (program ? 'โปรแกรม' : 'ผลการแข่งขัน') + 'ทั้งหมด →</a></section>' +
    '<aside class="follow-card"><span aria-hidden="true">🏫</span><h2>ส่งใจให้โรงเรียนของคุณ</h2><p>รวมผลทุกกีฬา พร้อมสรุปชนะ เสมอ แพ้</p><a class="button" href="#schools">เลือกโรงเรียน →</a><a class="related-link" href="#knockout">ดูรอบรองฯ และรอบชิง →</a></aside></div>';
}

function eventPicker(route) {
  const tab = route.page === 'sport' ? route.tab : ({standings:'teams'}[route.page] || route.page);
  if (!route.sport) return heading({schedule:'ดูโปรแกรมแข่ง',results:'ดูผลการแข่งขัน',standings:'ดูตารางคะแนน',knockout:'รอบรองฯ และรอบชิง'}[route.page] || 'เลือกกีฬา', 'เลือกกีฬาที่ต้องการดู') + sportNav('',tab) +
    (['schedule','results'].includes(route.page) ? '<a class="related-link" href="' + esc(link(route.page,{...route,viewAll:true})) + '">ดู' + (route.page === 'schedule' ? 'โปรแกรมรวมทุกกีฬา' : 'ผลรวมทุกกีฬา') + ' →</a>' : '');
  return heading(SPORTS[route.sport], 'เลือกรุ่นและประเภทที่ต้องการติดตาม') + '<div class="event-grid">' + Object.entries(LEVELS).map(([level,label]) => {
    const types = Object.keys(TYPES).filter(type => data.matches.some(m => m.sport === route.sport && m.level === level && m.type === type));
    return types.length ? '<section class="event-choice"><h2>' + label + '</h2><div>' + types.map(type => '<a class="button" href="' + esc(link('sport',{sport:route.sport,level,type,tab,dedicated:true})) + '">' + TYPES[type] + ' →</a>').join('') + '</div></section>' : '';
  }).join('') + '</div><a class="related-link" href="' + esc(link(route.page === 'sport' ? 'schedule' : route.page)) + '">← เปลี่ยนกีฬา</a>';
}

function pageSlice(items, route, renderer) {
  const size = 6, pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(1, Math.min(pages, Math.floor(route.pageNumber || 1)));
  const body = renderer(items.slice((current - 1) * size, current * size));
  return '<p class="list-count">' + items.length + ' รายการ · หน้า ' + current + ' / ' + pages + '</p>' + body + (pages > 1 ? '<nav class="pagination" aria-label="หน้ารายการ">' +
    (current > 1 ? '<a class="button" href="' + esc(link(route.page,{...route,pageNumber:current-1})) + '">← ก่อนหน้า</a>' : '<span></span>') +
    '<span>' + current + ' / ' + pages + '</span>' + (current < pages ? '<a class="button" href="' + esc(link(route.page,{...route,pageNumber:current+1})) + '">ถัดไป →</a>' : '<span></span>') + '</nav>' : '');
}

function filtered(route) {
  return data.matches.filter(match => (!route.sport || match.sport === route.sport) &&
    (!route.level || match.level === route.level) && (!route.type || match.type === route.type));
}

function schedule(route) {
  if (!route.dedicated && !route.viewAll && !route.query) return eventPicker(route);
  const query = route.query.toLocaleLowerCase('th');
  const matches = ordered(filtered(route).filter(m => (route.day === '0' || String(m.day) === route.day) && (!query || [m.home,m.away,m.id].some(v => String(v).toLocaleLowerCase('th').includes(query)))));
  return (route.page === 'sport' ? '' : heading(route.query ? 'ผลค้นหา “' + route.query + '”' : 'โปรแกรมรวมทุกกีฬา')) + dayNav(route,true) +
    (matches.length ? pageSlice(matches,route,rows => '<div class="match-list">' + rows.map(m => fixture(m)).join('') + '</div>') : empty('ไม่มีโปรแกรมตามวันที่เลือก'));
}

function results(route) {
  if (!route.dedicated && !route.viewAll) return eventPicker(route);
  const scores = ordered(filtered(route).filter(m => hasScore(m) && (route.day === '0' || String(m.day) === route.day))).reverse();
  return (route.page === 'sport' ? '' : heading('ผลรวมทุกกีฬา')) + dayNav(route,true) + (scores.length ? pageSlice(scores,route,rows => '<div class="match-list">' + rows.map(m => fixture(m)).join('') + '</div>') : empty('ยังไม่มีผลในวันที่เลือก'));
}

function teamPage(route) {
  if (!route.dedicated) return eventPicker(route);
  const matches = filtered(route);
  const groups = [...new Set(matches.filter(m => ['group','league'].includes(m.stage)).map(m => m.group || 'league'))].sort();
  const group = groups.includes(route.group) ? route.group : groups[0];
  const nav = groups.length > 1 ? '<nav class="group-tabs" aria-label="เลือกสาย">' + groups.map(g => '<a class="pill" href="' + esc(link(route.page,{...route,group:g})) + '"' + (g === group ? ' aria-current="page"' : '') + '>สาย ' + esc(g) + '</a>').join('') + '</nav>' : '';
  return nav + groupCards(matches.filter(m => (m.group || 'league') === group && ['group','league'].includes(m.stage)),route.sport) + qualifiers(route);
}

function knockoutPage(route) {
  if (!route.dedicated) return eventPicker(route);
  const games = filtered(route);
  if (!games.some(m => m.stage === 'semi')) return empty('รายการนี้แข่งขันแบบพบกันหมด ดูอันดับได้ที่ตารางคะแนน', '<a class="button" href="' + esc(link('sport',{...route,tab:'teams'})) + '">ดูตารางคะแนน</a>');
  const round = ['semi','third','final'].includes(route.round) ? route.round : 'semi';
  return '<nav class="group-tabs" aria-label="เลือกรอบ">' + [['semi','รอบรองฯ'],['third','ชิงที่ 3'],['final','ชิงชนะเลิศ']].map(([r,label]) => '<a class="pill" href="' + esc(link(route.page,{...route,round:r})) + '"' + (r === round ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>' + knockoutMarkup(games,data.fields,{schoolName,qualifiers:data.qualifiers || [],visibleStages:[round]});
}

function sportPage(route) {
  if (!route.dedicated) return eventPicker(route);
  return '<a class="back-link" href="' + esc(link('sport',{sport:route.sport,tab:route.tab})) + '">← เปลี่ยนรุ่น / ประเภท</a><div class="sport-heading ' + route.sport + '">' + sportIcon(route.sport) + '<div><p>' + SPORTS[route.sport] + '</p><h1>' + LEVELS[route.level] + ' · ' + TYPES[route.type] + '</h1></div></div>' +
    '<nav class="sport-tabs" aria-label="ข้อมูลรายการ">' + Object.entries({...sportTabs,teams:'ตารางคะแนน',knockout:'รอบรองฯ / ชิง'}).map(([tab,label]) => '<a href="' + esc(link('sport',{...route,tab,day:tab === 'results' ? '0' : '1',pageNumber:1})) + '"' + (tab === route.tab ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>' + {schedule,results,teams:teamPage,knockout:knockoutPage}[route.tab](route);
}

function schoolMatch(match, school) {
  const home = participates(match.home, school);
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

function participates(team, school) { return team === school || String(team).split(' + ').includes(school); }

function schoolsPage(route) {
  const schools = [...new Set(data.matches.filter(m => m.ready !== false).flatMap(m => [m.home,m.away]).flatMap(n => String(n).split(' + ')))].filter(n => n.startsWith('โรงเรียน')).sort((a,b) => a.localeCompare(b,'th'));
  if (!schools.length) schools.push(...data.schools);
  const active = schools.includes(route.school) ? route.school : '';
  if (!active) return heading('ส่งใจให้โรงเรียนของคุณ','เลือกโรงเรียนเพื่อดูผลจากทุกกีฬา') + '<div class="school-directory">' + schools.map(name => '<a href="' + esc(link('schools',{school:name})) + '">' + schoolName(name) + '<span aria-hidden="true">→</span></a>').join('') + '</div>';
  const all = ordered(data.matches.filter(m => participates(m.home,active) || participates(m.away,active)));
  const games = all.filter(hasScore).reverse().map(m => schoolMatch(m,active));
  const stats = schoolStats(games);
  const visible = games.filter(g => !route.sport || g.match.sport === route.sport);
  return '<a class="back-link" href="#schools">← เปลี่ยนโรงเรียน</a><h1 class="selected-school">' + schoolName(active) + '</h1><div class="school-summary"><span>แข่ง <b>' + games.length + '</b></span><span>ชนะ <b>' + stats.win + '</b></span><span>เสมอ <b>' + stats.draw + '</b></span><span>แพ้ <b>' + stats.loss + '</b></span></div>' +
    '<a class="related-link" href="' + esc(link('schedule',{query:active,day:'0',viewAll:true})) + '">ดูโปรแกรมโรงเรียน →</a><nav class="group-tabs" aria-label="ผลแยกกีฬา">' + [['','ทุกกีฬา'],...Object.entries(SPORTS)].map(([sport,label]) => '<a class="pill" href="' + esc(link('schools',{school:active,sport})) + '"' + (route.sport === sport ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>' +
    (visible.length ? pageSlice(visible,route,rows => '<div class="match-list">' + rows.map(g => fixture(g.match)).join('') + '</div>') : empty('ยังไม่มีผลการแข่งขันในส่วนนี้'));
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
  showSimulationNotice(data, content);
  const route = readRoute();
  document.body.dataset.page = route.page;
  if (syncSearch) search.elements.query.value = route.query;
  document.querySelectorAll('.main-nav a').forEach(item => {
    if (item.hash === '#' + (route.page === 'sport' ? ({teams:'standings',knockout:'standings'}[route.tab] || route.tab) : route.page)) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  if (data) content.innerHTML = {home: homepage, schedule, results, standings: teamPage, knockout: knockoutPage, schools: schoolsPage, venues, sport: sportPage}[route.page](route);
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
