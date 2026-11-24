import assert from 'node:assert/strict';
import {numberedRoster_,competition_} from '../supabase/functions/naklang3-sports/rules.js';
const schools=['บ้านภูพระ','บ้านหนองด้วง','ซำขอนแก่น','บ้านโนนสวรรค์','บ้านท่าอุทัย','บ้านโนนม่วง','บ้านโนนไหม','บ้านโนนเมือง','บ้านหนองกุงศรี','บ้านโนนสวาท'];
const snapshot={version:1,config:{teamNumbers:Object.fromEntries(schools.map((name,i)=>[String(i+1),name])),schools,schoolLogos:{},roster:{},settings:{},groupDraw:{assignments:{'football:upper:boys':{A1:'1',A2:'2',A3:'3'}}}},events:[],matches:[],teams:[]};
for(const [sport,prefix] of [['football','F'],['volleyball','V'],['takraw','T'],['petanque','P']])for(const [type,suffix] of [['boys','B'],['girls','G']]){
 const id=prefix+'M'+suffix;snapshot.events.push({id,sport,level:'middle',type});
 for(let a=1;a<=4;a++){
  snapshot.teams.push({id:id+'-'+a,event_id:id});
  for(let b=a+1;b<=4;b++)snapshot.matches.push({id:id+'-'+a+b,eventId:id,sport,level:'middle',type,day:1,start:'11:15',field:prefix+'1',home:'ทีม '+a,away:'ทีม '+b,stage:'league',group:'',homeScore:'',awayScore:'',scoreSets:[],tieWinner:'',published:true});
 }
}
snapshot.events.push({id:'FUB',sport:'football',level:'upper',type:'boys'});
for(let a=1;a<=3;a++){
 snapshot.teams.push({id:'FUB-A'+a,event_id:'FUB'});
 for(let b=a+1;b<=3;b++)snapshot.matches.push({id:'FUB-'+a+b,eventId:'FUB',sport:'football',level:'upper',type:'boys',day:1,start:'11:15',field:'F4',home:'สาย A · ทีม '+a,away:'สาย A · ทีม '+b,stage:'group',group:'A',homeScore:'',awayScore:'',scoreSets:[],tieWinner:'',published:true});
}
const roster=new Map(Object.entries(snapshot.config.groupDraw.assignments).map(([key,numbers])=>[key,{numbers}]));
const selected=['1','6','8','9'];
const unassigned=competition_(snapshot.matches,numberedRoster_(snapshot.matches,roster,snapshot.config.teamNumbers,[]),true);
assert(unassigned.matches.filter(m=>m.level==='middle').every(m=>!m.ready&&m.home.startsWith('รอกำหนด')));
const resolved=competition_(snapshot.matches,numberedRoster_(snapshot.matches,roster,snapshot.config.teamNumbers,selected),true);
assert.equal(resolved.draws.filter(d=>d.level==='middle').length,8);
for(const draw of resolved.draws.filter(d=>d.level==='middle')) {
 assert.deepEqual(Object.values(draw.numbers),selected);
 assert.deepEqual(Object.values(draw.teams),selected.map(n=>snapshot.config.teamNumbers[n]));
}
assert.deepEqual(resolved.matches.filter(m=>m.level!=='middle'),unassigned.matches.filter(m=>m.level!=='middle'));
let handler,live,commits;
const fakeKey='isolated-test-key';
const fakeHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fakeKey))).toString('hex');
globalThis.Deno={env:{get:n=>n==='SUPABASE_URL'?'https://test.invalid':n==='SUPABASE_SECRET_KEYS'?'{"default":"test-only"}':undefined},serve:fn=>handler=fn};
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);
 if(url.endsWith('sports_naklang3_snapshot'))return Response.json(live);
 assert(url.endsWith('sports_naklang3_commit'));commits.push(body);return Response.json(true);
};
await import('../supabase/functions/naklang3-sports/index.ts');
function reset(numbers=[]){live=structuredClone(snapshot);live.config.middleSchoolNumbers=numbers;live.admin_key_hash=fakeHash;commits=[];}
async function request(action,extra={}){const response=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({action,key:fakeKey,expectedVersion:snapshot.version,...extra})}));return {status:response.status,body:await response.json()};}
reset();assert.equal((await request('saveMiddleSchools',{middleSchools:{numbers:selected}})).status,200);
assert.equal(commits.length,1);assert.deepEqual(commits[0].p_config.middleSchoolNumbers,selected);
assert.deepEqual(commits[0].p_matches,snapshot.matches);
const middleIds=new Set(snapshot.events.filter(e=>e.level==='middle').map(e=>e.id));
assert.equal(commits[0].p_teams.filter(t=>[...middleIds].some(id=>t.id.startsWith(id+'-'))).length,32);
for(const bad of [['1','6','8'],['1','1','8','9'],['1','6','8','99']]){reset();assert.equal((await request('saveMiddleSchools',{middleSchools:{numbers:bad}})).status,400);assert.equal(commits.length,0);}
reset(selected);const match=live.matches.find(m=>m.eventId==='FMB');match.homeScore=1;match.awayScore=0;
assert.equal((await request('saveMiddleSchools',{middleSchools:{numbers:['1','2','8','9']}})).status,400);assert.equal(commits.length,0);
reset(selected);const next={...live.config.teamNumbers,'1':live.config.teamNumbers['5'],'5':live.config.teamNumbers['1']};
assert.equal((await request('saveTeamNumbers',{teams:{previous:live.config.teamNumbers,teams:next}})).status,200);
assert.deepEqual(commits[0].p_config.middleSchoolNumbers,['5','6','8','9']);
console.log('PASS: explicit four-school selection, no first-four fallback, 8 events, global numbering, invalid selections, score protection, renumbering, unchanged schedule');
