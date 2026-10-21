import {apiGet,apiPost,apiPatch,downloadFile,escapeHTML,getUser} from './api.js';
import {requireRole,shell,renderTopbar,logout} from './auth.js';
export {apiGet,apiPost,apiPatch,downloadFile,escapeHTML,getUser,requireRole,shell,logout};

renderTopbar();

export function q(name){return new URLSearchParams(location.search).get(name)}
export function status(s){return `<span class="status ${escapeHTML(String(s||'').toLowerCase())}">${escapeHTML(String(s||'').replaceAll('_',' '))}</span>`}
export function money(v){return Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}

// big number cards used on the dashboards
export function renderStats(el,items){
  el.innerHTML=items.map(i=>`<a class="stat-card" href="${escapeHTML(i.href||'#')}"><h3>${escapeHTML(i.label)}</h3><div class="stat-value">${escapeHTML(i.value??0)}</div><p>${escapeHTML(i.note||'')}</p><span class="more">View details →</span></a>`).join('');
}

// shows any page error at the top instead of leaving the page blank
function showError(message){
  if(!message||document.querySelector('.error-banner'))return;
  const box=document.createElement('div');
  box.className='error-banner';
  box.setAttribute('role','alert');
  box.textContent='Something went wrong: '+message;
  const main=document.querySelector('main');
  if(main)main.prepend(box);else document.body.append(box);
}
window.addEventListener('unhandledrejection',e=>showError(e.reason?.message||String(e.reason)));
window.addEventListener('error',e=>showError(e.message));
