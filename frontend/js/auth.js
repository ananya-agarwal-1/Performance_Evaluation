import {apiGet,getUser} from './api.js';

const pages={employee:'employee.html',manager:'manager.html',sm:'senior.html',senior_authority:'senior.html',performance_officer:'officer.html',board_member:'board.html',admin:'admin.html'};

const roleNames={employee:'Employee',manager:'Manager',sm:'Senior Manager',senior_authority:'Senior Manager',performance_officer:'Performance Officer',board_member:'Appeal Board',admin:'HR / Admin'};

// links shown in the sidebar for each role
const seniorLinks=[['Dashboard','senior.html'],['Employees','reports.html?type=employees'],['Performance','reports.html?type=performance'],['Appeals','appeal-detail.html?queue=senior'],['Reports','reports.html?type=work']];
const navLinks={
  employee:[['Dashboard','employee.html'],['My Profile','profile.html'],['Achievements','achievements.html'],['My Work','work.html'],['Projects','work.html?type=project'],['Appraisal','appraisal.html'],['Appeal','appeal-detail.html'],['Download','reports.html?type=credits']],
  manager:[['Dashboard','manager.html'],['Employees','directory.html'],['Team Work','work.html?mode=review'],['Assign Work','work.html?new=assigned'],['Appraisal','appraisal.html'],['Recognition','recognition.html']],
  senior_authority:seniorLinks,
  sm:seniorLinks,
  performance_officer:[['Dashboard','officer.html'],['Employees','reports.html?type=employees'],['Performance','reports.html?type=performance'],['Work','reports.html?type=work'],['Appeals','reports.html?type=appeals']],
  board_member:[['Dashboard','board.html'],['Board Cases','appeal-detail.html?queue=board'],['Appeal Report','reports.html?type=appeals']],
  admin:[['Dashboard','admin.html'],['Employees','reports.html?type=employees'],['Work','reports.html?type=work'],['Performance','reports.html?type=performance'],['Appeals','reports.html?type=appeals'],['Reports','reports.html?type=credits'],['Audit','audit.html']]
};

export function pageForRole(r){return pages[r]||'login.html'}
export function roleName(r){return roleNames[r]||r||''}

export async function requireRole(roles){const u=getUser();if(!localStorage.getItem('token')||!roles.includes(u.role)){logout();return null}try{const s=await apiGet('/api/auth/me');if(s.data?.user?.employee_id!==u.employee_id)return logout();return u}catch{logout();return null}}
export function logout(){localStorage.removeItem('token');localStorage.removeItem('user');location.href='login.html'}

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

// finds the link that matches the current page best
function markActive(root){
  let best=null,bestScore=0;
  root.querySelectorAll('nav a').forEach(a=>{
    const url=new URL(a.getAttribute('href'),location.href);
    if(url.pathname!==location.pathname)return;
    let score=0;
    if(url.search&&url.search===location.search)score=2;
    else if(!url.search)score=1;
    if(score>bestScore){best=a;bestScore=score}
  });
  if(best)best.classList.add('active');
}

// builds the sidebar once for every logged-in page
export function renderTopbar(){
  if(document.querySelector('.sidebar'))return;
  const u=getUser();
  const links=(navLinks[u.role]||[]).concat([['Notifications','notifications.html']]);
  const name=u.name||u.employee_id||'User';
  document.querySelectorAll('body > header, body > nav').forEach(el=>el.remove());
  const bar=document.createElement('aside');
  bar.className='sidebar';
  bar.innerHTML=`<div class="side-brand">EPMS</div>
    <nav aria-label="Main">${links.map(l=>`<a href="${l[1]}">${esc(l[0])}</a>`).join('')}</nav>
    <div class="side-user"><a href="profile.html" data-user-name>${esc(name)}</a><small data-user-role>${esc(roleName(u.role))}</small></div>
    <button type="button" class="logout" data-logout>Logout</button>`;
  document.body.classList.add('has-sidebar');
  document.body.prepend(bar);
  markActive(bar);
}

export function greeting(u){
  const h=new Date().getHours();
  const part=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  const first=String(u.name||'').trim().split(/\s+/)[0];
  return first?'Welcome, '+first:'Welcome';
}

export function shell(active='home'){
  const u=getUser();
  document.querySelectorAll('[data-user-name]').forEach(el=>el.replaceChildren(document.createTextNode(u.name||u.employee_id||'User')));
  document.querySelectorAll('[data-user-role]').forEach(el=>el.replaceChildren(document.createTextNode(roleName(u.role))));
  document.querySelectorAll('[data-logout]').forEach(b=>b.onclick=logout);
  const g=document.querySelector('#greeting');
  if(g)g.textContent=greeting(u);
}
