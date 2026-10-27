// ===== Supabase 연결 정보 (공개 키만 넣는다) =====
const SUPABASE_URL = 'https://vsdlsezrjivsjhjlkmhu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_div4d1rJA-Z-8m4wPO1IMA_KRtT7MD3';
const BUCKET = 'resume';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// 올릴 수 있는 파일 종류와 새 파일 이름에 붙일 확장자
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
const FILE_TYPES = { ...IMAGE_TYPES, 'application/pdf': 'pdf' };

// 프로필 폼에 보여 줄 칸: [표의 칸 이름, 화면 이름, 여러 줄인가]
const PROFILE_FIELDS = [
  ['name', '이름'],
  ['title', '직함'],
  ['career_badge', '경력 배지'],
  ['email', '이메일'],
  ['phone', '연락처'],
  ['location', '위치'],
  ['headline', '한 줄 소개 (이름이 들어가면 파란 밑줄)', true],
  ['intro', '소개 글', true],
  ['education', 'EDUCATION', true],
  ['skills', 'SKILLS & TOOLS', true],
  ['experience', 'EXPERIENCE', true],
  ['quote', '맨 아래 인용', true]
];

// ===== 로그인 정보 보관 =====
let session = null;

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem('resume_admin_session'));
  } catch {
    return null;
  }
}

function saveSession(value) {
  session = value;
  try {
    if (value) localStorage.setItem('resume_admin_session', JSON.stringify(value));
    else localStorage.removeItem('resume_admin_session');
  } catch {
    // 저장이 안 되는 브라우저면 이 탭에서만 로그인 상태를 유지한다
  }
}

// Supabase 로그인 응답을 보관할 모양으로 바꾼다
function toSession(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
    user: { id: data.user.id, email: data.user.email }
  };
}

async function requestToken(grantType, body) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=' + grantType, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error_description || data.msg || '로그인 실패');
    error.status = res.status;
    throw error;
  }
  return toSession(data);
}

// 토큰 시간이 다 됐으면 새로 받는다
async function refreshSession() {
  if (!session || !session.refresh_token) throw new Error('로그인 필요');
  saveSession(await requestToken('refresh_token', { refresh_token: session.refresh_token }));
}

async function ensureFreshToken() {
  if (session && session.expires_at - 60 < Date.now() / 1000) {
    try {
      await refreshSession();
    } catch {
      showLogin('다시 로그인해 주세요.');
      throw new Error('로그인이 끝났어요');
    }
  }
}

// ===== 요청 도우미 (로그인 토큰을 붙여 보낸다) =====
async function send(url, options = {}, retried = false) {
  await ensureFreshToken();
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + session.access_token,
      ...(options.headers || {})
    },
    body: options.body
  });

  // 토큰이 막 만료됐으면 한 번만 새로 받아 다시 보낸다
  if (res.status === 401 && !retried) {
    try {
      await refreshSession();
    } catch {
      showLogin('다시 로그인해 주세요.');
      throw new Error('로그인이 끝났어요');
    }
    return send(url, options, true);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || '요청 실패 (' + res.status + ')');
  }
  return data;
}

function api(path, options = {}) {
  return send(SUPABASE_URL + '/rest/v1/' + path, {
    method: options.method,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

// 바꾸거나 지운 줄을 돌려받아, 0줄이면 규칙에 막힌 것으로 본다
async function apiChange(path, method, body) {
  const rows = await api(path, {
    method,
    headers: { Prefer: 'return=representation' },
    body
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('바뀐 것이 없어요. 관리자 권한을 확인해 주세요.');
  }
  return rows;
}

// ===== 파일 올리기 =====
function checkFile(file, allowedTypes) {
  if (!file) return null;
  if (!allowedTypes[file.type]) {
    return allowedTypes === IMAGE_TYPES
      ? '이미지 파일(PNG·JPG·WEBP·GIF)만 올릴 수 있어요.'
      : '이미지 파일(PNG·JPG·WEBP·GIF)이나 PDF만 올릴 수 있어요.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return '10MB보다 큰 파일은 올릴 수 없어요. (지금 ' + (file.size / 1024 / 1024).toFixed(1) + 'MB)';
  }
  return null;
}

// 영어·숫자로만 된 새 이름을 지어 올리고, 공개 주소를 돌려준다
async function uploadFile(file, folder, allowedTypes) {
  const problem = checkFile(file, allowedTypes);
  if (problem) throw new Error(problem);

  const random = Math.random().toString(36).slice(2, 8);
  const path = folder + '/' + Date.now() + '-' + random + '.' + allowedTypes[file.type];

  await send(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
    body: file
  });
  return SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
}

// 파일을 고르자마자 종류·크기를 확인해 안내한다
function watchFileInput(input, allowedTypes, messageId) {
  input.addEventListener('change', () => {
    const problem = checkFile(input.files[0], allowedTypes);
    if (problem) {
      setMessage(messageId, problem, true);
      input.value = '';
    } else {
      setMessage(messageId, '');
    }
  });
}

// ===== 작은 도우미 =====
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function $(id) {
  return document.getElementById(id);
}

function button(text, onClick, className) {
  const node = el('button', 'btn small' + (className ? ' ' + className : ''), text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function setMessage(id, text, isError) {
  const box = $(id);
  box.textContent = text;
  box.classList.toggle('error', Boolean(isError));
}

function safeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

// 버튼을 잠시 잠그고 일을 한 뒤 다시 푼다
async function busy(buttonNode, work) {
  buttonNode.disabled = true;
  try {
    await work();
  } finally {
    buttonNode.disabled = false;
  }
}

const PERSON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';

// ===== 화면 바꾸기 =====
function showOnly(viewId) {
  ['login-view', 'denied-view', 'admin-view'].forEach((id) => {
    $(id).classList.toggle('hidden', id !== viewId);
  });
  const loggedIn = viewId !== 'login-view';
  $('logout-button').classList.toggle('hidden', !loggedIn);
  $('who').textContent = loggedIn && session ? session.user.email : '';
}

function showLogin(message) {
  saveSession(null);
  showOnly('login-view');
  setMessage('login-message', message || '', Boolean(message));
}

// ===== 로그인·로그아웃 =====
async function login() {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) {
    setMessage('login-message', '이메일과 비밀번호를 모두 적어 주세요.', true);
    return;
  }
  setMessage('login-message', '로그인 중…');
  await busy($('login-button'), async () => {
    try {
      saveSession(await requestToken('password', { email, password }));
      $('login-password').value = '';
      setMessage('login-message', '');
      await enter();
    } catch (error) {
      setMessage(
        'login-message',
        error.status === 400 ? '이메일 또는 비밀번호가 맞지 않아요.' : '로그인하지 못했어요. 잠시 후 다시 해 주세요.',
        true
      );
    }
  });
}

async function logout() {
  try {
    await fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token }
    });
  } catch {
    // 서버에 못 알려도 이 브라우저에서는 로그아웃한다
  }
  showLogin();
}

// 로그인한 사람이 admins 표에 있는지 확인하고 알맞은 화면을 연다
async function enter() {
  const rows = await api('admins?select=user_id&user_id=eq.' + encodeURIComponent(session.user.id));
  if (!rows || rows.length === 0) {
    showOnly('denied-view');
    return;
  }
  showOnly('admin-view');
  await Promise.all([loadProfile(), loadProjects(), loadGuestbook()]);
}

// ===== 프로필 =====
let profile = null;

function buildProfileForm() {
  const box = $('profile-fields');
  PROFILE_FIELDS.forEach(([key, label, multiline]) => {
    const field = el('div', 'field' + (multiline ? ' wide' : ''));
    const labelNode = el('label', null, label);
    labelNode.htmlFor = 'pf-profile-' + key;
    const input = el(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.id = 'pf-profile-' + key;
    field.append(labelNode, input);
    box.append(field);
  });
}

function showPhoto(url) {
  const box = $('profile-photo-preview');
  box.textContent = '';
  const safe = safeUrl(url);
  if (safe) {
    const img = el('img');
    img.src = safe;
    img.alt = '지금 프로필 사진';
    img.addEventListener('error', () => { box.innerHTML = PERSON_ICON; });
    box.append(img);
  } else {
    box.innerHTML = PERSON_ICON;
  }
}

async function loadProfile() {
  try {
    const rows = await api('profile?select=*&id=eq.1');
    profile = rows[0] || null;
    PROFILE_FIELDS.forEach(([key]) => {
      $('pf-profile-' + key).value = (profile && profile[key]) || '';
    });
    showPhoto(profile && profile.photo_url);
  } catch (error) {
    setMessage('profile-message', '프로필을 불러오지 못했어요. ' + error.message, true);
  }
}

async function saveProfile() {
  await busy($('profile-save'), async () => {
    try {
      const data = { id: 1, updated_at: new Date().toISOString() };
      PROFILE_FIELDS.forEach(([key]) => {
        data[key] = $('pf-profile-' + key).value.trim();
      });

      const file = $('profile-photo-file').files[0];
      if (file) {
        setMessage('profile-message', '사진 올리는 중…');
        data.photo_url = await uploadFile(file, 'profile', IMAGE_TYPES);
      }

      setMessage('profile-message', '저장하는 중…');
      // 한 줄이 이미 있으면 고치고, 없으면 새로 만든다
      const rows = await api('profile?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: data
      });
      profile = rows[0];
      $('profile-photo-file').value = '';
      showPhoto(profile.photo_url);
      setMessage('profile-message', '저장했어요. 방문자 화면을 새로고침하면 보여요.');
    } catch (error) {
      setMessage('profile-message', '저장하지 못했어요. ' + error.message, true);
    }
  });
}

// ===== 포트폴리오 카드와 좋아요 =====
let projects = [];
let likeCounts = {};
let editingId = null;   // 고치는 카드 번호 (새 카드면 null)
let editingFiles = {};  // 고치는 카드의 지금 thumbnail_url, file_url

async function loadProjects() {
  try {
    const [projectRows, likeRows] = await Promise.all([
      api('projects?select=*&order=sort_order.asc,id.asc'),
      api('likes?select=project_id')
    ]);
    projects = projectRows;
    likeCounts = {};
    likeRows.forEach((row) => {
      likeCounts[row.project_id] = (likeCounts[row.project_id] || 0) + 1;
    });
    renderProjects();
    renderLikes();
  } catch (error) {
    setMessage('project-message', '카드를 불러오지 못했어요. ' + error.message, true);
  }
}

function renderProjects() {
  const list = $('project-list');
  list.textContent = '';
  if (projects.length === 0) {
    list.append(el('li', 'status', '아직 카드가 없어요. 아래에서 추가해 주세요.'));
    return;
  }

  projects.forEach((project, index) => {
    const row = el('li', 'admin-row');

    const thumb = el('div', 'admin-thumb');
    const thumbUrl = safeUrl(project.thumbnail_url);
    if (thumbUrl) {
      const img = el('img');
      img.src = thumbUrl;
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      thumb.append(img);
    }

    const main = el('div', 'admin-row-main');
    main.append(
      el('p', 'card-meta', [project.number, project.category].filter(Boolean).join(' · ')),
      el('p', 'card-title', project.title)
    );
    const sub = el('p', 'admin-row-sub');
    sub.append(el('span', 'like-number', '♥ ' + (likeCounts[project.id] || 0)));
    sub.append(project.file_url ? ' · 첨부 파일 있음' : '');
    main.append(sub);

    const buttons = el('div', 'admin-row-buttons');
    const up = button('▲ 위로', () => moveProject(index, -1));
    up.disabled = index === 0;
    up.setAttribute('aria-label', project.title + ' 위로 올리기');
    const down = button('▼ 아래로', () => moveProject(index, 1));
    down.disabled = index === projects.length - 1;
    down.setAttribute('aria-label', project.title + ' 아래로 내리기');
    buttons.append(
      up,
      down,
      button('수정', () => openEditor(project)),
      button('삭제', () => deleteProject(project), 'danger')
    );

    row.append(thumb, main, buttons);
    list.append(row);
  });
}

// 순서 바꾸기: 새 순서대로 1, 2, 3… 을 다시 매기고 달라진 카드만 고친다
async function moveProject(index, step) {
  const target = index + step;
  if (target < 0 || target >= projects.length) return;
  const ordered = projects.slice();
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  setMessage('project-message', '순서를 바꾸는 중…');
  try {
    for (let i = 0; i < ordered.length; i += 1) {
      if (ordered[i].sort_order !== i + 1) {
        await apiChange('projects?id=eq.' + ordered[i].id, 'PATCH', { sort_order: i + 1 });
      }
    }
    setMessage('project-message', '순서를 바꿨어요.');
  } catch (error) {
    setMessage('project-message', '순서를 바꾸지 못했어요. ' + error.message, true);
  }
  await loadProjects();
}

async function deleteProject(project) {
  if (!confirm('"' + project.title + '" 카드를 지울까요?\n이 카드의 좋아요도 함께 지워지고, 되돌릴 수 없어요.')) return;
  try {
    await apiChange('projects?id=eq.' + project.id, 'DELETE');
    if (editingId === project.id) closeEditor();
    setMessage('project-message', '카드를 지웠어요.');
  } catch (error) {
    setMessage('project-message', '지우지 못했어요. ' + error.message, true);
  }
  await loadProjects();
}

// 지금 올라가 있는 파일을 보여 주고, "빼기"로 연결을 끊을 수 있게 한다
function renderCurrentFile(kind) {
  const box = $(kind === 'thumbnail_url' ? 'pf-thumb-current' : 'pf-file-current');
  box.textContent = '';
  const url = safeUrl(editingFiles[kind]);
  if (!url) {
    box.textContent = '지금 올라간 파일 없음';
    return;
  }
  const link = el('a', null, '지금 파일 보기');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  box.append(link, button('빼기', () => {
    editingFiles[kind] = null;
    renderCurrentFile(kind);
  }));
}

function openEditor(project) {
  editingId = project ? project.id : null;
  editingFiles = {
    thumbnail_url: project ? project.thumbnail_url : null,
    file_url: project ? project.file_url : null
  };
  $('project-editor-title').textContent = project ? '카드 수정' : '새 카드';
  $('pf-number').value = project ? project.number : '';
  $('pf-category').value = project ? project.category : '';
  $('pf-title').value = project ? project.title : '';
  $('pf-description').value = project ? project.description : '';
  $('pf-tags').value = project ? (project.tags || []).join(', ') : '';
  $('pf-thumb-file').value = '';
  $('pf-file-file').value = '';
  renderCurrentFile('thumbnail_url');
  renderCurrentFile('file_url');
  setMessage('project-message', '');
  $('project-editor').classList.remove('hidden');
  $('pf-title').focus();
}

function closeEditor() {
  editingId = null;
  $('project-editor').classList.add('hidden');
}

async function saveProject() {
  const title = $('pf-title').value.trim();
  if (!title) {
    setMessage('project-message', '제목을 적어 주세요.', true);
    return;
  }

  await busy($('project-save'), async () => {
    try {
      const data = {
        number: $('pf-number').value.trim(),
        category: $('pf-category').value.trim(),
        title,
        description: $('pf-description').value.trim(),
        tags: $('pf-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean),
        thumbnail_url: editingFiles.thumbnail_url || null,
        file_url: editingFiles.file_url || null
      };

      const thumbFile = $('pf-thumb-file').files[0];
      const attachFile = $('pf-file-file').files[0];
      if (thumbFile) {
        setMessage('project-message', '썸네일 올리는 중…');
        data.thumbnail_url = await uploadFile(thumbFile, 'projects', IMAGE_TYPES);
      }
      if (attachFile) {
        setMessage('project-message', '첨부 파일 올리는 중…');
        data.file_url = await uploadFile(attachFile, 'projects', FILE_TYPES);
      }

      setMessage('project-message', '저장하는 중…');
      if (editingId) {
        await apiChange('projects?id=eq.' + editingId, 'PATCH', data);
      } else {
        // 새 카드는 맨 뒤에 붙인다
        data.sort_order = projects.reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
        await apiChange('projects', 'POST', data);
      }
      closeEditor();
      setMessage('project-message', '저장했어요. 방문자 화면을 새로고침하면 보여요.');
      await loadProjects();
    } catch (error) {
      setMessage('project-message', '저장하지 못했어요. ' + error.message, true);
    }
  });
}

function renderLikes() {
  const list = $('like-list');
  list.textContent = '';
  if (projects.length === 0) {
    list.append(el('li', 'status', '카드가 없어요.'));
    return;
  }
  projects.forEach((project) => {
    const count = likeCounts[project.id] || 0;
    const row = el('li', 'admin-row');
    const main = el('div', 'admin-row-main');
    main.append(
      el('p', 'card-title', project.title),
      el('p', 'admin-row-sub like-number', '♥ ' + count)
    );
    const buttons = el('div', 'admin-row-buttons');
    const reset = button('좋아요 초기화', () => resetLikes(project), 'danger');
    reset.disabled = count === 0;
    buttons.append(reset);
    row.append(main, buttons);
    list.append(row);
  });
}

async function resetLikes(project) {
  if (!confirm('"' + project.title + '" 카드의 좋아요를 0으로 되돌릴까요?\n되돌릴 수 없어요.')) return;
  try {
    await apiChange('likes?project_id=eq.' + project.id, 'DELETE');
    setMessage('like-message', '좋아요를 초기화했어요.');
  } catch (error) {
    setMessage('like-message', '초기화하지 못했어요. ' + error.message, true);
  }
  await loadProjects();
}

// ===== 방명록 =====
async function loadGuestbook() {
  const list = $('guestbook-admin-list');
  try {
    const rows = await api('resume_guestbook?select=*&order=created_at.desc');
    list.textContent = '';
    if (rows.length === 0) {
      list.append(el('li', 'status', '남겨진 글이 없어요.'));
      return;
    }
    rows.forEach((entry) => {
      const row = el('li', 'admin-row');
      const main = el('div', 'admin-row-main');
      const date = new Date(entry.created_at);
      main.append(
        el('p', 'card-title', entry.nickname),
        el('p', 'admin-row-sub', isNaN(date) ? '' : date.toLocaleString('ko-KR')),
        el('p', 'guestbook-text', entry.message)
      );
      const buttons = el('div', 'admin-row-buttons');
      buttons.append(button('삭제', () => deleteGuestbook(entry), 'danger'));
      row.append(main, buttons);
      list.append(row);
    });
  } catch (error) {
    setMessage('guestbook-message', '방명록을 불러오지 못했어요. ' + error.message, true);
  }
}

async function deleteGuestbook(entry) {
  if (!confirm('"' + entry.nickname + '" 님의 글을 지울까요?\n되돌릴 수 없어요.')) return;
  try {
    await apiChange('resume_guestbook?id=eq.' + entry.id, 'DELETE');
    setMessage('guestbook-message', '글을 지웠어요.');
  } catch (error) {
    setMessage('guestbook-message', '지우지 못했어요. ' + error.message, true);
  }
  await loadGuestbook();
}

// ===== 처음 열 때 =====
async function start() {
  buildProfileForm();

  $('login-button').addEventListener('click', login);
  $('login-password').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) login();
  });
  $('logout-button').addEventListener('click', logout);
  $('profile-save').addEventListener('click', saveProfile);
  $('project-new').addEventListener('click', () => openEditor(null));
  $('project-save').addEventListener('click', saveProject);
  $('project-cancel').addEventListener('click', closeEditor);

  watchFileInput($('profile-photo-file'), IMAGE_TYPES, 'profile-message');
  watchFileInput($('pf-thumb-file'), IMAGE_TYPES, 'project-message');
  watchFileInput($('pf-file-file'), FILE_TYPES, 'project-message');

  session = loadSession();
  if (!session) {
    showLogin();
    return;
  }
  try {
    await enter();
  } catch {
    showLogin('다시 로그인해 주세요.');
  }
}

start();
