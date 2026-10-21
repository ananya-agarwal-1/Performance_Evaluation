import {apiPost} from './api.js';
import {pageForRole} from './auth.js';

const form=document.querySelector('#login-form');
const msg=document.querySelector('#page-message');
const roleSelect=document.querySelector('#role');

// the role list depends on whether the person is a User or HR / Admin
const roleGroups={
  user:[['employee','Team Employee'],['manager','Manager'],['senior_authority','Senior Manager']],
  admin:[['admin','HR / Admin'],['performance_officer','Performance Officer'],['board_member','Appeal Board']]
};
function fillRoles(){
  const group=form.group.value;
  roleSelect.innerHTML=roleGroups[group].map(r=>`<option value="${r[0]}">${r[1]}</option>`).join('');
}
form.querySelectorAll('input[name=group]').forEach(r=>r.onchange=fillRoles);
fillRoles();

form.onsubmit=async e=>{
  e.preventDefault();
  const btn=form.querySelector('button[type=submit]');
  btn.disabled=true;
  msg.className='message';
  msg.textContent='Logging in...';
  try{
    const r=await apiPost('/api/auth/login',{role:form.role.value,email:form.email.value.trim(),password:form.password.value});
    localStorage.setItem('token',r.token);
    localStorage.setItem('user',JSON.stringify(r.user));
    location.href=pageForRole(r.user.role);
  }catch(err){
    msg.className='message error';
    msg.textContent=err.message;
  }finally{
    btn.disabled=false;
  }
};
