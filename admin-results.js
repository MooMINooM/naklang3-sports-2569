import {schoolNameMarkup} from './school-label.js?v=20261123-wide-groups';
import {SPORTS,LEVELS,TYPES,STAGES,DAYS,escapeHtml as esc,hasScore,usesSets,setResult,ordered,clock,minutes,duration,fieldName} from './sports-data.js?v=20261123-supabase';

export function resultState(match) {
  return hasScore(match) ? 'completed' : match.ready === false ? 'waiting' : 'pending';
}
export function filterResultMatches(data, filters = {}) {
  const query = (filters.query || '').trim().toLocaleLowerCase('th');
  return ordered(data.matches.filter(m => {
    const round = !filters.round || (filters.round === 'knockout' ? ['semi','third','final'].includes(m.stage) : filters.round === 'group' ? ['group','league'].includes(m.stage) : m.stage === filters.round);
    const text = [m.id,m.home,m.away,SPORTS[m.sport],LEVELS[m.level],TYPES[m.type],fieldName(data.fields,m.field)].join(' ').toLocaleLowerCase('th');
    return round && (!filters.day || Number(filters.day) === m.day) && (!filters.sport || filters.sport === m.sport) &&
      (!filters.level || filters.level === m.level) && (!filters.type || filters.type === m.type) &&
      (!filters.status || filters.status === resultState(m)) &&
      (!filters.published || (filters.published === 'published') === m.published) && (!query || text.includes(query));
  }));
}
export function nextUnscored(matches, currentId) {
  const index = matches.findIndex(m => m.id === currentId);
  return [...matches.slice(index + 1), ...matches.slice(0,index + 1)].find(m => m.id !== currentId && resultState(m) === 'pending') || null;
}
export function resultCards(matches, data) {
  if (!matches.length) return '<div class="empty"><span aria-hidden="true">⌕</span><h3>ไม่พบคู่แข่งขันตามที่เลือก</h3><p>ลองเปลี่ยนตัวกรอง หรือเลือกดูทุกสถานะ</p><button type="button" data-reset-filters>ดูคู่แข่งขันทั้งหมด</button></div>';
  const days = new Map();
  for (const m of matches) { if (!days.has(m.day)) days.set(m.day,[]); days.get(m.day).push(m); }
  function team(m, side) {
    return '<div class="card-team '+(m.winnerSide === side ? 'winner' : '')+'">'+schoolNameMarkup(m[side],data.schoolLogos || {})+
      (m.winnerSide === side ? '<span class="winner-badge">ผู้ชนะ</span>' : '')+'</div>';
  }
  function card(m) {
    const state=resultState(m),setSport=usesSets(m.sport),scored=hasScore(m);
    const label=state==='completed'?'บันทึกแล้ว':state==='waiting'?'รอคู่แข่งขัน':'รอลงผล';
    const score=scored?'<span class="score-number home-number">'+esc(m.homeScore)+'</span><span class="score-separator">–</span><span class="score-number away-number">'+esc(m.awayScore)+'</span>':'<span class="versus">พบ</span>';
    const scoreSets=m.scoreSets?.length?'<p class="card-set-scores">'+m.scoreSets.map((pair,i)=>'<span>เซต '+(i+1)+' <b>'+pair.map(esc).join('–')+'</b></span>').join('')+'</p>':'';
    const unit=scored?(setSport?'เซต':m.sport==='football'?'ประตู':'แต้ม'):'';
    const pendingTie=data.qualifiers?.some(q=>q.pendingTie&&q.sport===m.sport&&q.level===m.level&&q.type===m.type);
    const needsSchools=state==='waiting'&&['group','league'].includes(m.stage);
    const waiting=state==='waiting'?(needsSchools?'รอกำหนดโรงเรียนให้ครบ':pendingTie?'สถิติเท่ากัน รอกรรมการตัดสินอันดับ':'รอผลการแข่งขันรอบก่อนหน้า'):'';
    const resolveAction=state==='waiting'&&pendingTie?'<button type="button" class="text-button" data-resolve-tie="'+esc(m.id)+'">ตัดสินอันดับ</button>':needsSchools?'<button type="button" class="text-button" data-assign-school="'+esc(m.id)+'">กำหนดโรงเรียน</button>':'';
    const end=clock(minutes(m.start)+duration(m));
    return '<article class="match-card '+esc(m.sport)+'" data-match-id="'+esc(m.id)+'">'+
      '<div class="card-heading"><div class="card-tags"><span class="sport-tag">'+esc(SPORTS[m.sport])+'</span><span>'+esc(LEVELS[m.level]+TYPES[m.type])+'</span><span class="round-tag">'+esc(STAGES[m.stage])+(m.group?' · สาย '+esc(m.group):'')+'</span></div><span class="result-state '+state+'">'+label+'</span></div>'+
      '<div class="card-body"><div class="card-time"><strong>'+esc(m.start)+' <small>น.</small></strong><span>ถึง '+end+' น.</span><span>'+esc(fieldName(data.fields,m.field))+'</span></div><div class="card-scoreboard">'+team(m,'home')+'<div class="card-score"><strong>'+score+'</strong><small>'+unit+'</small></div>'+team(m,'away')+'</div><button type="button" class="primary score-action" data-score="'+esc(m.id)+'"'+(state==='waiting'?' disabled':'')+' aria-label="'+(scored?'แก้ไขผล':'กรอกผล')+' '+esc(m.id)+'">'+(scored?'แก้ไขผล':state==='waiting'?'รอคู่แข่งขัน':'กรอกผล')+'</button></div>'+
      '<div class="card-footer"><div>'+scoreSets+(waiting?'<p class="waiting-note">'+waiting+'</p>':'')+'<span class="match-id">'+esc(m.id)+'</span><span class="publication">'+(m.published?'เผยแพร่แล้ว':'ฉบับร่าง')+'</span></div><div class="card-footer-actions">'+resolveAction+'<button type="button" class="text-button" data-edit="'+esc(m.id)+'" aria-label="แก้ไขคิว '+esc(m.id)+'">แก้ไขคิว</button></div></div></article>';
  }
  return [...days].map(([day,rows])=>'<section class="match-day"><div class="day-heading"><h3>'+esc(DAYS[day])+'</h3><span>'+rows.length+' คู่แข่งขัน</span></div><div class="match-cards">'+rows.map(card).join('')+'</div></section>').join('');
}
