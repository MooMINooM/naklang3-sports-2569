export const SPORTS = {football: 'ฟุตบอล', volleyball: 'วอลเลย์บอล', takraw: 'ตะกร้อ', petanque: 'เปตอง'};
export const LEVELS = {kg: 'อนุบาล', lower: 'ประถมต้น', upper: 'ประถมปลาย', middle: 'มัธยมต้น'};
export const TYPES = {boys: 'ชาย', girls: 'หญิง'};
export const STAGES = {group: 'รอบแบ่งกลุ่ม', league: 'พบกันหมด', semi: 'รอบรองชนะเลิศ', third: 'ชิงอันดับ 3', final: 'ชิงชนะเลิศ'};
export const DAYS = {1: 'วันที่ 1', 2: 'วันที่ 2', 3: 'วันที่ 3', 4: 'วันที่ 4'};

const durations = {football: {kg: 25, lower: 35, upper: 41, middle: 45}, volleyball: 60, takraw: 30, petanque: 90};
const entities = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
export const usesSets = sport => sport === 'volleyball' || sport === 'takraw';
export function setResult(sets) {
  if (!Array.isArray(sets) || sets.length > 3) throw new Error('กรอกผลได้สูงสุด 3 เซต');
  const wins = [0, 0];
  const points = [0, 0];
  for (const pair of sets) {
    if (!Array.isArray(pair) || pair.length !== 2 ||
        !pair.every(score => Number.isInteger(score) && score >= 0 && score <= 999)) {
      throw new Error('กรอกแต้มทั้งสองทีมในแต่ละเซตเป็นจำนวนเต็ม 0–999');
    }
    if (wins.includes(2)) throw new Error('จบการแข่งขันเมื่อทีมใดทีมหนึ่งชนะ 2 เซต');
    if (pair[0] === pair[1]) throw new Error('แต้มในเซตเดียวกันต้องมีผู้ชนะ');
    wins[pair[0] > pair[1] ? 0 : 1]++;
    points[0] += pair[0];
    points[1] += pair[1];
  }
  return {wins, points, finished: wins.includes(2)};
}

export const hasScore = match => match.homeScore !== '' && match.awayScore !== '';
export function duration({sport, level}) {
  return sport === 'football' ? durations.football[level] : durations[sport];
}
export const minutes = time => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};
export const clock = value => [Math.floor(value / 60), value % 60].map(n => String(n).padStart(2, '0')).join(':');
export const ordered = matches => [...matches].sort((a, b) =>
  a.day - b.day || a.start.localeCompare(b.start) || a.field.localeCompare(b.field));
export const fieldName = (fields, id) => fields.find(field => field.id === id)?.name || id;
export const blank = {matches: [], schools: [], fields: [], settings: {minDay1: '10:15', minOther: '08:00', end: '17:30'}};

export function options(values, selected, placeholder) {
  const first = placeholder ? '<option value="">' + escapeHtml(placeholder) + '</option>' : '';
  return first + Object.entries(values).map(([value, label]) =>
    '<option value="' + escapeHtml(value) + '"' + (value === String(selected) ? ' selected' : '') +
    '>' + escapeHtml(label) + '</option>').join('');
}

export function standings(matches, sport) {
  const groups = new Map();
  for (const match of matches) {
    if (match.sport !== sport || !['group', 'league'].includes(match.stage)) continue;

    const groupKey = [match.level, match.type, match.group].join('|');
    if (!groups.has(groupKey)) groups.set(groupKey, {match, teams: new Map()});
    const {teams} = groups.get(groupKey);
    for (const [name, score, opponent] of [[match.home, match.homeScore, match.awayScore], [match.away, match.awayScore, match.homeScore]]) {
      if (!teams.has(name)) teams.set(name, {name, played: 0, wins: 0, ties: 0, losses: 0, difference: 0, goals: 0});
      if (!hasScore(match)) continue;

      const team = teams.get(name);
      team.played++;
      team.difference += Number(score) - Number(opponent);
      team.goals += Number(score);
      if (Number(score) > Number(opponent)) team.wins++;
      else if (Number(score) === Number(opponent)) team.ties++;
      else team.losses++;
    }
  }

  const compare = (a, b) => b.points - a.points || b.difference - a.difference || b.goals - a.goals;
  return Array.from(groups.values(), ({match, teams}) => {
    const rows = Array.from(teams.values(), row => ({
      ...row, points: sport === 'football' ? row.wins * 3 + row.ties : row.wins,
    })).sort((a, b) => compare(a, b) || a.name.localeCompare(b.name, 'th'));
    return {match, rows: rows.map(row => ({...row, rank: rows.findIndex(other => compare(other, row) === 0) + 1}))};
  });
}
