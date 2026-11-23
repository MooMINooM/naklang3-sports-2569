import {
  check, scoreMatch_, scored_, managed_, eventKey_, competition_, numberedRoster_,
  validateTeamName_, checkDependencies_, TEAM_NUMBERS, COLUMNS, FIELDS,
} from './rules.js';

const importId = '48ed94aa-2fff-57fe-a1ba-884e3fe3e7d9';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

async function rpc(name, body) {
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', apikey: secret},
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error('Sports database request failed', name, response.status);
    throw new Error('ติดต่อฐานข้อมูลการแข่งขันไม่ได้ กรุณาลองอีกครั้ง');
  }
  return response.json();
}

async function authorized(key, hash) {
  if (typeof key !== 'string' || !key || key.length > 256) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  let difference = actual.length ^ hash.length;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
  return difference === 0;
}

function roster(config) {
  return new Map(Object.entries(config.roster || {}).map(([key, tieOrder]) => [key, {tieOrder}]));
}

function output(snapshot, canEdit) {
  const {config, matches, version} = snapshot;
  const draw = numberedRoster_(matches, roster(config), config.teamNumbers);
  const competition = competition_(matches.filter(match => canEdit || match.published), draw, canEdit);
  return {...competition, fields: FIELDS, schools: config.schools, settings: config.settings,
    schoolLogos: config.schoolLogos, canEdit, formatVersion: 6, version,
    ...(canEdit ? {teamNumbers: config.teamNumbers} : {})};
}

function saveMatch(snapshot, input) {
  if (!input || typeof input !== 'object') throw new Error('ข้อมูลคู่แข่งขันไม่ถูกต้อง');
  const before = snapshot.matches;
  const prior = before.find(match => match.id === input.id);
  if (input.id && !prior) throw new Error('ไม่พบคู่แข่งขัน');
  const match = Object.fromEntries(COLUMNS.map(name => [name, input[name]]));
  match.tieWinner = input.tieWinner || '';
  match.day = Number(input.day);
  match.durationMinutes = prior?.durationMinutes;
  if (['id','start','sport','level','type','field','home','away','stage','group'].some(name => typeof match[name] !== 'string') ||
      typeof match.published !== 'boolean') throw new Error('ข้อมูลคู่แข่งขันไม่ถูกต้อง');
  if (prior && managed_(prior) && ['sport','level','type','stage','group','home','away'].some(name => match[name] !== prior[name])) {
    throw new Error('แก้ชื่อโรงเรียนจากเมนูกำหนดเลขทีมโรงเรียน');
  }
  scoreMatch_(match, input, prior);
  if ((match.homeScore === '') !== (match.awayScore === '') ||
      [match.homeScore, match.awayScore].some(score => score !== '' && !(Number.isInteger(score) && score >= 0 && score <= 999))) {
    throw new Error('กรอกคะแนนทั้งสองทีมเป็นจำนวนเต็ม 0–999');
  }
  const tied = scored_(match) && match.homeScore === match.awayScore && ['semi','third','final'].includes(match.stage);
  if (tied && !['home','away'].includes(match.tieWinner)) throw new Error('เลือกผู้ชนะจากการตัดสิน');
  if (!tied) match.tieWinner = '';
  const scheduleChanged = !prior || ['day','start','sport','level','type','field','stage','group','home','away'].some(name => match[name] !== prior[name]);
  if (scheduleChanged) {
    const error = check(match, before, FIELDS, snapshot.config.settings);
    if (error) throw new Error(error);
  }
  match.id ||= crypto.randomUUID();
  const event = snapshot.events.find(event => event.sport === match.sport && event.level === match.level && event.type === match.type);
  if (!event) throw new Error('ไม่มีรายการกีฬารุ่นนี้ในตาราง');
  match.eventId = event.id;
  const after = prior ? before.map(row => row.id === match.id ? match : row) : [...before, match];
  const draw = roster(snapshot.config);
  const oldDraw = numberedRoster_(before, draw, snapshot.config.teamNumbers);
  const nextDraw = numberedRoster_(after, draw, snapshot.config.teamNumbers);
  const derived = competition_(after, nextDraw, true).matches.find(row => row.id === match.id);
  if (scored_(match) && !derived.ready) throw new Error('กรอกชื่อทีมและรอผลรอบก่อนหน้าให้ครบก่อนบันทึกผล');
  checkDependencies_(before, after, oldDraw, nextDraw);
  snapshot.matches = after;
  return match.id;
}

function saveNumbers(snapshot, input) {
  const config = snapshot.config;
  if (TEAM_NUMBERS.some(number => (config.teamNumbers[number] || '') !== input?.previous?.[number])) {
    throw new Error('ทะเบียนเลขทีมมีการแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่');
  }
  const next = Object.fromEntries(TEAM_NUMBERS.map(number => [number, validateTeamName_(input.teams?.[number])]));
  const names = Object.values(next).filter(Boolean);
  if (new Set(names).size !== names.length) throw new Error('ชื่อโรงเรียนต้องไม่ซ้ำกัน');
  const draw = roster(config);
  checkDependencies_(snapshot.matches, snapshot.matches,
    numberedRoster_(snapshot.matches, draw, config.teamNumbers), numberedRoster_(snapshot.matches, draw, next));
  const logos = {...config.schoolLogos};
  for (const number of TEAM_NUMBERS) {
    const name = next[number];
    const raw = input.logos?.[number] ?? config.schoolLogos[name] ?? '';
    if (!name) continue;
    if (!raw) {
      if (name === config.teamNumbers[number]) delete logos[name];
      continue;
    }
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || raw.length > 1500) throw new Error('ใช้ลิงก์โลโก้ HTTPS ที่เปิดดูได้โดยตรง');
    logos[name] = url.href;
  }
  config.teamNumbers = next;
  config.schoolLogos = logos;
  return true;
}

function saveDraw(snapshot, input) {
  const oldRoster = roster(snapshot.config);
  const draw = output(snapshot, true).draws.find(draw => draw.key === input?.key);
  if (!draw) throw new Error('ไม่พบรายการจับสลาก');
  const order = String(input.tieOrder || '').toUpperCase().split(/[\s,]+/).filter(Boolean);
  if (!order.every(slot => draw.slots.includes(slot)) || new Set(order).size !== order.length) {
    throw new Error('กรอกรหัสทีมตัดสินอันดับให้ถูกต้องและไม่ซ้ำ');
  }
  snapshot.config.roster[draw.key] = order.join(',');
  checkDependencies_(snapshot.matches, snapshot.matches,
    numberedRoster_(snapshot.matches, oldRoster, snapshot.config.teamNumbers),
    numberedRoster_(snapshot.matches, roster(snapshot.config), snapshot.config.teamNumbers));
  return true;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: cors});
  if (request.method !== 'POST') return Response.json({error: 'ใช้ POST สำหรับระบบการแข่งขัน'}, {status: 405, headers: cors});
  try {
    const body = await request.text();
    if (body.length > 32768) throw new Error('ข้อมูลคำขอมีขนาดใหญ่เกินไป');
    const message = JSON.parse(body);
    if (!['read','save','saveDraw','saveTeamNumbers'].includes(message.action)) throw new Error('คำสั่งไม่ถูกต้อง');
    const snapshot = await rpc('sports_naklang3_snapshot', {p_import_id: importId});
    const canEdit = await authorized(message.key, snapshot.admin_key_hash);
    if (message.action === 'read') {
      if (message.key && !canEdit) throw new Error('รหัสผู้จัดไม่ถูกต้อง');
      return Response.json({value: output(snapshot, canEdit)}, {headers: cors});
    }
    if (!canEdit) return Response.json({error: 'ต้องใช้รหัสผู้จัดที่ถูกต้อง'}, {status: 401, headers: cors});
    if (message.expectedVersion !== snapshot.version) throw new Error('ข้อมูลมีการเปลี่ยนแปลง กรุณาโหลดข้อมูลใหม่ก่อนบันทึก');
    let value;
    if (message.action === 'save') value = saveMatch(snapshot, message.match);
    if (message.action === 'saveDraw') value = saveDraw(snapshot, message.draw);
    if (message.action === 'saveTeamNumbers') value = saveNumbers(snapshot, message.teams);
    const resolved = output(snapshot, true);
    const teams = snapshot.teams.map(team => {
      const event = snapshot.events.find(event => event.id === team.event_id);
      const draw = resolved.draws.find(draw => draw.key === eventKey_(event));
      const slot = team.id.slice(team.event_id.length + 1);
      const school = draw?.teams[slot] || '';
      return {id: team.id, school_name: school || null, logo_url: snapshot.config.schoolLogos[school] || null};
    });
    const saved = await rpc('sports_naklang3_commit', {p_import_id: importId, p_version: snapshot.version,
      p_config: snapshot.config, p_matches: snapshot.matches, p_teams: teams});
    if (!saved) throw new Error('มีผู้จัดบันทึกข้อมูลพร้อมกัน กรุณาโหลดข้อมูลใหม่ก่อนบันทึก');
    return Response.json({value}, {headers: cors});
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลได้'}, {status: 400, headers: cors});
  }
});
