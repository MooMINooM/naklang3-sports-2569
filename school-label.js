import {escapeHtml as esc} from './sports-data.js?v=20261123-supabase';

export function schoolNameMarkup(name, logos = {}) {
  const schools = String(name ?? '').split(/\s*\+\s*/).filter(Boolean);
  const marks = schools.map(school => {
    const raw = Object.hasOwn(logos, school) ? logos[school] : '';
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      return '<img class="school-mark" src="' + esc(url.href) + '" alt="" width="28" height="28" loading="lazy" referrerpolicy="no-referrer">';
    } catch {
      return '';
    }
  }).join('');
  return '<span class="school-name' + (schools.length > 1 ? ' school-name-combined' : '') + '">' +
    (marks ? '<span class="school-marks" aria-hidden="true">' + marks + '</span>' : '') +
    '<span class="school-name-text">' + esc(name) + '</span></span>';
}
