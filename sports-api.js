const endpoint = 'https://script.google.com/macros/s/AKfycbygr4nA_tO-Y6fvSbFBSUtqW_X20lJsJZcDAM_vbrB1sePwfKT7bLLZyaDZJ3DJN_OrNw/exec';
const googleScriptOrigin = /^https:\/\/(?:[a-z0-9-]+-)?script\.googleusercontent\.com$/;
const timeoutMs = 25000;
let connection;

function openConnection() {
  return new Promise((resolve, reject) => {
    const bridgeId = Array.from(crypto.getRandomValues(new Uint8Array(16)), n =>
      n.toString(16).padStart(2, '0')).join('');
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'เชื่อมข้อมูลการแข่งขัน';
    const url = new URL(endpoint);
    url.searchParams.set('bridge', bridgeId);
    frame.src = url;

    const pending = new Map();
    let sequence = 0;
    let peer;
    let peerOrigin;

    function comesFromFrame(source) {
      for (let level = 0; source && source !== window && level < 4; level++) {
        if (source === frame.contentWindow) return true;
        source = source.parent;
      }
      return false;
    }

    function receive(event) {
      const message = event.data;
      if (!message || message.bridgeId !== bridgeId) return;
      if (!peer && message.ready && googleScriptOrigin.test(event.origin) && comesFromFrame(event.source)) {
        peer = event.source;
        peerOrigin = event.origin;
        clearTimeout(startTimeout);
        resolve(request);
        return;
      }
      if (!peer || event.source !== peer || event.origin !== peerOrigin) return;

      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error));
      else entry.resolve(message.value);
    }

    function request(message) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('ระบบใช้เวลาตอบกลับนานเกินไป'));
        }, timeoutMs);
        pending.set(id, {resolve, reject, timer});
        peer.postMessage({bridgeId, id, ...message}, peerOrigin);
      });
    }

    const startTimeout = setTimeout(() => {
      window.removeEventListener('message', receive);
      frame.remove();
      reject(new Error('ติดต่อระบบข้อมูลการแข่งขันไม่ได้ กรุณาลองอีกครั้ง'));
    }, timeoutMs);
    window.addEventListener('message', receive);
    document.body.append(frame);
  });
}

async function send(message) {
  connection ??= openConnection().catch(error => {
    connection = undefined;
    throw error;
  });
  return (await connection)(message);
}

export const readSports = (key = '') => send({action: 'read', key});
export const saveMatch = (key, match) => send({action: 'save', key, match});
export const saveDraw = (key, draw) => send({action: 'saveDraw', key, draw});
export const saveTeamNumbers = (key, teams) => send({action: 'saveTeamNumbers', key, teams});
