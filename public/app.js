const tokenKey = 'areia-token';
const userKey = 'areia-user';
let token = localStorage.getItem(tokenKey);
let user = JSON.parse(localStorage.getItem(userKey) || 'null');
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.erro || 'Não foi possível completar a ação.');
    error.status = response.status;
    throw error;
  }
  return body;
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function refreshAuth() {
  const authButton = $('#auth-button');
  if (authButton) authButton.textContent = user ? 'Sair' : 'Entrar';
  const createButton = $('#create-button');
  if (createButton) createButton.classList.toggle('hidden', user?.role !== 'organizador');
}
async function loadLeagues() {
  const host = $('#league-list');
  if (!host) return;
  try {
    const leagues = await api('/api/leagues');
    $('#league-content')?.removeAttribute('hidden');
    if (!leagues.length) { host.innerHTML = '<div class="empty">Ainda não há ligas por aqui. Seja a primeira pessoa a organizar uma.</div>'; return; }
    host.innerHTML = leagues.map(league => {
      const joined = league.participants.some(p => p._id === user?.id);
      const owner = league.organizer._id === user?.id;
      const active = league.status === 'aguardando_participantes';
      const action = owner && active ? `<button class="button button-dark draw" data-id="${league._id}" ${league.participants.length < 4 ? 'disabled title="Mínimo de 4 participantes"' : ''}>Sortear grupos</button>` : user?.role === 'participante' && active ? `<button class="button button-dark join" data-id="${league._id}" ${joined ? 'disabled' : ''}>${joined ? 'Inscrito' : 'Participar'}</button>` : `<span>${league.groups?.length || 0} grupos</span>`;
      const groupInfo = league.status === 'grupos_sorteados' ? `<p class="league-meta">${league.groups.map((g, i) => `Grupo ${i + 1}: ${g.map(p => esc(p.name)).join(', ')}`).join(' · ')}</p>` : '';
      return `<article class="league-card"><div><div class="league-top"><span class="pill ${active ? '' : 'closed'}">${active ? 'Inscrições abertas' : 'Grupos sorteados'}</span><span class="league-meta">${league.participants.length} atletas</span></div><h3>${esc(league.name)}</h3><p class="league-meta">Organizada por ${esc(league.organizer.name)}</p>${groupInfo}</div><div class="card-bottom"><span>${active ? 'Junte-se à liga' : 'Boa sorte na areia!'}</span>${action}</div></article>`;
    }).join('');
    host.querySelectorAll('.join').forEach(button => button.onclick = async () => { try { await api(`/api/leagues/${button.dataset.id}/join`, { method: 'POST' }); toast('Você entrou na liga!'); loadLeagues(); } catch (err) { toast(err.message); } });
    host.querySelectorAll('.draw').forEach(button => button.onclick = async () => { try { await api(`/api/leagues/${button.dataset.id}/draw`, { method: 'POST' }); toast('Grupos sorteados com sucesso!'); loadLeagues(); } catch (err) { toast(err.message); } });
  } catch (err) {
    if (err.status === 401) {
      token = null; user = null;
      localStorage.removeItem(tokenKey); localStorage.removeItem(userKey);
      refreshAuth();
      if ($('#league-content')) {
        $('#league-content').setAttribute('hidden', '');
        requireLogin();
        return;
      }
    }
    host.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}
function requireLogin() {
  const notice = $('#auth-notice');
  if (notice) {
    notice.textContent = 'Crie uma conta ou entre para ter acesso';
    notice.classList.remove('hidden');
  }
  $('#auth-dialog')?.showModal();
}
const authButton = $('#auth-button');
if (authButton) authButton.onclick = () => {
  if (user) {
    token = null;
    user = null;
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    window.location.assign('/');
    return;
  }
  $('#auth-dialog')?.showModal();
};
let registerMode = false;
function setAuthMode(value) { registerMode = value; $('#register-fields').classList.toggle('hidden', !value); $('#auth-title').innerHTML = value ? 'Criar conta<span>.</span>' : 'Entrar<span>.</span>'; $('#auth-eyebrow').textContent = value ? 'FAÇA PARTE DA COMUNIDADE' : 'BEM-VINDO DE VOLTA'; $('#auth-submit').textContent = value ? 'Criar conta' : 'Entrar'; $('#auth-switch').textContent = value ? 'Já tenho uma conta' : 'Criar uma conta'; $('#auth-form [name="password"]').autocomplete = value ? 'new-password' : 'current-password'; }
const authSwitch = $('#auth-switch');
if (authSwitch) authSwitch.onclick = () => setAuthMode(!registerMode);
const authSubmit = $('#auth-submit');
if (authSubmit) authSubmit.onclick = async () => {
  const form = $('#auth-form'); const data = Object.fromEntries(new FormData(form)); const error = $('#auth-error'); error.textContent = '';
  try {
    if (registerMode) await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: data.name, email: data.email, password: data.password, role: data.role }) });
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: data.email, password: data.password }) });
    token = result.token; user = result.usuario; localStorage.setItem(tokenKey, token); localStorage.setItem(userKey, JSON.stringify(user));
    $('#auth-notice')?.classList.add('hidden');
    $('#auth-dialog').close(); form.reset(); setAuthMode(false); refreshAuth();
    const destination = sessionStorage.getItem('areia-after-login');
    if (destination) {
      sessionStorage.removeItem('areia-after-login');
      window.location.assign(destination);
      return;
    }
    loadLeagues(); toast(`Olá, ${user.name}!`);
  } catch (err) { error.textContent = err.message; }
};
const createButton = $('#create-button');
if (createButton) createButton.onclick = () => $('#league-dialog')?.showModal();
const leagueSubmit = $('#league-submit');
if (leagueSubmit) leagueSubmit.onclick = async () => { const name = new FormData($('#league-form')).get('name'); try { await api('/api/leagues', { method: 'POST', body: JSON.stringify({ name }) }); $('#league-dialog').close(); $('#league-form').reset(); loadLeagues(); toast('Liga criada! Agora é só reunir os participantes.'); } catch (err) { $('#league-error').textContent = err.message; } };
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
document.querySelectorAll('a[href="/ligas"]').forEach(link => link.addEventListener('click', event => {
  if (token && user) return;
  event.preventDefault();
  sessionStorage.setItem('areia-after-login', '/ligas');
  requireLogin();
}));
refreshAuth();
if ($('#league-content')) {
  if (token && user) loadLeagues();
  else {
    sessionStorage.setItem('areia-after-login', '/ligas');
    requireLogin();
  }
}
