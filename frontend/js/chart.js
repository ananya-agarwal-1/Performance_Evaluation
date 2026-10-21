import {apiGet,escapeHTML} from './api.js';

// plain HTML/CSS vertical bar graph, no libraries
function niceMax(v){
  if(v<=0)return 10;
  const p=Math.pow(10,Math.floor(Math.log10(v)));
  const n=v/p;
  return (n<=1?1:n<=2?2:n<=5?5:10)*p;
}
function monthLabel(l){
  const m=/^(\d{4})-(\d{2})$/.exec(l);
  if(!m)return l;
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m[2])-1]+' '+m[1].slice(2);
}

export async function renderPerformanceChart(host){
  host.innerHTML='<p class="muted">Loading chart…</p>';
  const r=await apiGet('/api/portal/performance-chart');
  const c=r.chart||{groups:[]};
  const all=c.groups.flatMap(g=>g.bars.map(b=>b.value));
  if(!all.length){
    host.innerHTML=`<h3>${escapeHTML(c.title||'Performance')}</h3><p class="muted">No performance data yet.</p>`;
    return;
  }
  const top=niceMax(Math.max(...all)*1.08);
  const ticks=[top,top*0.75,top*0.5,top*0.25,0].map(t=>Math.round(t*10)/10);
  const group=g=>`
    ${g.title?`<h4 class="chart-group">${escapeHTML(g.title)}</h4>`:''}
    <div class="chart">
      <div class="chart-axis">${ticks.map(t=>`<span>${t}</span>`).join('')}</div>
      <div class="chart-bars">
        ${g.bars.map(b=>`<div class="chart-col" title="${escapeHTML(b.label)}: ${b.value}">
          <div class="chart-plot"><span class="chart-val">${b.value}</span><div class="chart-bar" style="height:${Math.max(b.value/top*100,1)}%"></div></div>
          <span class="chart-label">${escapeHTML(monthLabel(b.label))}</span>
        </div>`).join('')}
      </div>
    </div>`;
  host.innerHTML=`<h3>${escapeHTML(c.title)}</h3><p class="muted" style="margin:0 0 12px">${escapeHTML(c.subtitle||'')}</p>${c.groups.map(group).join('')}`;
}
