import {sportsConfig} from './config.js?v=20261123-supabase';

let version;

async function send(message) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(sportsConfig.apiUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', apikey: sportsConfig.publishableKey},
      body: JSON.stringify({...message, expectedVersion: version}),
      signal: controller.signal,
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'เชื่อมต่อข้อมูลการแข่งขันไม่ได้');
    if (message.action === 'read') version = result.value.version;
    return result.value;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('ระบบตอบกลับนานเกินไป กรุณาโหลดข้อมูลใหม่เพื่อตรวจสอบก่อนบันทึกอีกครั้ง');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const readSports = (key = '') => send({action: 'read', key});
export const saveMatch = (key, match) => send({action: 'save', key, match});
export const saveDraw = (key, draw) => send({action: 'saveDraw', key, draw});
export const saveTeamNumbers = (key, teams) => send({action: 'saveTeamNumbers', key, teams});

export const randomizeGroups = key => send({action: 'randomizeGroups', key});
