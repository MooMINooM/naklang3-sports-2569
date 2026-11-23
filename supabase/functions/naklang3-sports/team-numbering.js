const numbers = Array.from({length: 10}, (_, index) => String(index + 1));

export function sportTeamNumbers(teams, sport) {
  const entries = numbers.map(number => ({number, sourceNumbers: [number], school: teams[number] || ''}));
  if (!['football', 'volleyball'].includes(sport)) return entries;
  const nongDuang = entries.find(entry => entry.school.includes('หนองด้วง'));
  const samKhonKaen = entries.find(entry => entry.school.includes('ซำขอนแก่น'));
  if (!nongDuang || !samKhonKaen) return entries;
  const first = Math.min(Number(nongDuang.number), Number(samKhonKaen.number));
  const removed = Math.max(Number(nongDuang.number), Number(samKhonKaen.number));
  return entries.filter(entry => Number(entry.number) !== removed).map((entry, index) => ({
    number: String(index + 1),
    sourceNumbers: Number(entry.number) === first ? [String(first), String(removed)] : entry.sourceNumbers,
    school: Number(entry.number) === first ? nongDuang.school + ' + ' + samKhonKaen.school : entry.school,
  }));
}
