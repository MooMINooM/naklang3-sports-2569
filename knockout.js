import {SPORTS, LEVELS, TYPES, DAYS, escapeHtml as esc, hasScore, ordered, fieldName, usesSets} from './sports-data.js?v=20261123-supabase';

const stages = {semi: 'รอบรองชนะเลิศ · 4 ทีม', final: 'ชิงชนะเลิศ', third: 'ชิงอันดับ 3'};

export function knockoutMarkup(matches, fields, {admin = false, schoolName = esc, qualifiers = []} = {}) {
  const events = new Map();
  for (const match of ordered(matches).filter(match => Object.hasOwn(stages, match.stage))) {
    const key = [match.sport, match.level, match.type].join(':');
    if (!events.has(key)) events.set(key, []);
    events.get(key).push(match);
  }
  if (!events.size) return '<p class="empty">รายการนี้ใช้รอบพบกันหมด หรือยังไม่มีคู่รอบ 4 ทีมที่เผยแพร่</p>';
  return [...events.values()].map(games => {
    const event = games[0];
    const semi = games.filter(match => match.stage === 'semi');
    const pendingTie = qualifiers.some(row => row.sport === event.sport && row.level === event.level &&
      row.type === event.type && row.pendingTie);
    function participant(match, side) {
      const name = match[side];
      const labels = {
        'แชมป์สายตามประกบ¹': 'แชมป์สายที่ประกบกับรองแชมป์ดีที่สุด',
        'รองแชมป์สายผลงานดีที่สุด': 'รองแชมป์สายผลงานดีที่สุด',
        'แชมป์สายที่เหลือ 1': 'แชมป์สายอีกสาย',
        'แชมป์สายที่เหลือ 2': 'แชมป์สายที่เหลือ',
      };
      if (Object.hasOwn(labels, name)) return esc(labels[name]);
      const dependency = /^(ชนะ|แพ้) (.+)$/.exec(name);
      const index = dependency && semi.findIndex(game => game.id === dependency[2]);
      if (dependency && index >= 0) return 'ผู้' + dependency[1] + 'รองชนะเลิศคู่ที่ ' + (index + 1);
      return schoolName(name);
    }
    function card(match) {
      const scored = hasScore(match);
      const score = scored ? esc(match.homeScore) + '–' + esc(match.awayScore) + (usesSets(match.sport) ? ' เซต' : '') : 'พบ';
      const state = scored ? 'จบการแข่งขัน' : match.ready === false ? 'รอทีมจากรอบก่อนหน้า' : 'รอแข่งขัน';
      return '<article class="knockout-match"><div class="knockout-meta"><span>' + esc(match.id) + '</span><span>' +
        esc(DAYS[match.day] + ' ' + match.start + ' น.') + '</span></div><div class="knockout-teams">' +
        '<strong class="' + (match.winnerSide === 'home' ? 'knockout-winner' : '') + '">' + participant(match, 'home') +
        '</strong><span class="knockout-score">' + score + '</span><strong class="' +
        (match.winnerSide === 'away' ? 'knockout-winner' : '') + '">' + participant(match, 'away') + '</strong></div>' +
        '<p class="knockout-status">' + state + ' · ' + esc(fieldName(fields, match.field)) +
        (admin && !match.published ? ' · ฉบับร่าง' : '') + '</p>' +
        (scored && match.homeScore === match.awayScore && match.winnerSide ? '<p>ชนะในการตัดสิน · ' +
          schoolName(match[match.winnerSide]) + '</p>' : '') +
        (admin ? '<div class="row-actions"><button type="button" class="primary" data-score="' + esc(match.id) + '"' +
          (match.ready === false ? ' disabled' : '') + '>' + (scored ? 'แก้ผล' : 'ลงผล') +
          '</button><button type="button" data-edit="' + esc(match.id) + '">แก้ไขคิว</button></div>' : '') + '</article>';
    }
    return '<section class="knockout-event"><h2>' + esc(SPORTS[event.sport] + ' · ' + LEVELS[event.level] + TYPES[event.type]) +
      '</h2><p class="knockout-rule">แชมป์สาย A, B, C และรองแชมป์สายผลงานดีที่สุดเข้ารอบ 4 ทีม</p>' +
      (pendingTie ? '<p class="knockout-pending">รอกรรมการตัดสินอันดับที่สถิติเท่ากัน</p>' : '') +
      '<div class="knockout-grid">' + Object.entries(stages).map(([stage, title]) => {
        const rows = games.filter(match => match.stage === stage);
        return '<section class="knockout-round"><h3>' + title + '</h3>' +
          (rows.length ? rows.map(card).join('') : '<p class="empty">ยังไม่มีคู่ที่เผยแพร่</p>') + '</section>';
      }).join('') + '</div></section>';
  }).join('');
}
