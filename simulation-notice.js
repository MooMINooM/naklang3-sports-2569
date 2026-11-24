export function showSimulationNotice(data, anchor) {
  if (!anchor) return;
  let notice = document.getElementById('simulation-notice');
  if (!notice) {
    notice = document.createElement('p');
    notice.id = 'simulation-notice';
    notice.setAttribute('role', 'status');
    Object.assign(notice.style, {background: '#fff4c2', color: '#714900', border: '1px solid #e8bd52', borderRadius: '14px', padding: '12px 16px', margin: '16px 0', fontWeight: '700'});
    anchor.before(notice);
  }
  notice.hidden = !data?.simulationInfo?.active;
  notice.textContent = notice.hidden ? '' : 'ข้อมูลจำลองสำหรับทดสอบผลการแข่งขันและการเข้ารอบ';
}
