import{apiGet,escapeHTML,status,money,requireRole,shell,renderStats}from'./common.js';
import{renderPerformanceChart}from'./chart.js';

const roles=document.body.dataset.roles.split(',');
const user=await requireRole(roles);

if(user){
  shell('home');
  const r=await apiGet('/api/portal/summary');
  const d=r.data||{};
  const s=d.stats||{};
  let items;

  if(d.role==='employee'){
    items=[
      {label:'My work',value:s.work_total,note:'Everything you have logged so far.',href:'work.html'},
      {label:'Approved',value:s.approved,note:'Work your manager has signed off.',href:'work.html?status=approved'},
      {label:'Pending review',value:s.pending,note:'Waiting for a manager decision.',href:'work.html?status=submitted'},
      {label:'Credits',value:money(s.credits),note:'Earned from approved work.',href:'reports.html?type=credits'}
    ];
  }else if(d.role==='manager'){
    items=[
      {label:'Team',value:s.team,note:'Employees assigned to you.',href:'directory.html'},
      {label:'Pending reviews',value:s.pending,note:'Submitted work that needs a decision.',href:'work.html?mode=review'},
      {label:'Overdue',value:s.overdue,note:'Reviews past their due date.',href:'work.html?mode=overdue'}
    ];
  }else{
    items=[
      {label:'Users',value:s.users,note:'Accounts in the system.',href:'reports.html?type=employees'},
      {label:'Work',value:s.work,note:'Work records across all teams.',href:'reports.html?type=work'},
      {label:'Open appeals',value:s.open_appeals,note:'Appeals still waiting for a decision.',href:'reports.html?type=appeals'}
    ];
  }
  renderStats(document.querySelector('#cards'),items);

  const recent=document.querySelector('#recent');
  if(d.recent&&recent){
    recent.innerHTML=d.recent.length
      ?d.recent.map(w=>`<tr><td><a href="work.html?id=${w.id}">${escapeHTML(w.title)}</a></td><td>${escapeHTML(w.employee_name||'')}</td><td>${status(w.status)}</td><td>${money(w.credits_earned)}</td></tr>`).join('')
      :'<tr><td colspan="4" class="empty">No recent records.</td></tr>';
  }
  await renderPerformanceChart(document.querySelector('#perf-chart'));
}
