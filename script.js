// ===== Supabase 연결 정보 (공개 키만 넣는다) =====
const SUPABASE_URL = 'https://vsdlsezrjivsjhjlkmhu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_div4d1rJA-Z-8m4wPO1IMA_KRtT7MD3';

// Supabase 표에 fetch로 요청을 보낸다
async function api(path, options = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error((data && data.message) || '요청 실패');
    error.status = res.status;
    error.code = data && data.code;
    throw error;
  }
  return data;
}

// ===== 브라우저 저장소 (막혀 있어도 화면은 돌아가게) =====
function loadLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 안 되는 브라우저면 그냥 넘어간다
  }
}

// 이 브라우저의 번호 (좋아요를 카드마다 한 번만 누르게 할 때 쓴다)
function getClientId() {
  let id = loadLocal('resume_client_id', null);
  if (!id) {
    id = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    saveLocal('resume_client_id', id);
  }
  return id;
}

// ===== 작은 도우미 =====
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function setText(id, text) {
  document.getElementById(id).textContent = text || '';
}

// http·https 주소만 쓴다 (이상한 주소는 무시)
function safeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const PERSON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';
const HEART_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.2 3.3 4.5 7 4.5c2.1 0 3.6 1.1 5 2.8 1.4-1.7 2.9-2.8 5-2.8 3.7 0 6 3.7 4.5 7.3C19.5 16.4 12 21 12 21z"/></svg>';

// ===== 프로필 =====
function renderProfile(profile) {
  const p = profile || {};

  document.title = p.name ? p.name + ' 포트폴리오' : '포트폴리오';

  const photo = document.getElementById('photo');
  photo.textContent = '';
  const photoUrl = safeUrl(p.photo_url);
  if (photoUrl) {
    const img = el('img');
    img.src = photoUrl;
    img.alt = (p.name || '') + ' 프로필 사진';
    img.addEventListener('error', () => { photo.innerHTML = PERSON_ICON; });
    photo.append(img);
  } else {
    photo.innerHTML = PERSON_ICON;
  }

  setText('name', p.name);
  setText('job', p.title);
  setText('badge', p.career_badge);

  setText('contact-name', p.name);
  setText('contact-location', p.location);

  const email = document.getElementById('contact-email');
  email.textContent = p.email || '';
  if (p.email) email.href = 'mailto:' + p.email;

  const phone = document.getElementById('contact-phone');
  phone.textContent = p.phone || '';
  if (p.phone) phone.href = 'tel:' + p.phone.replace(/[^0-9+]/g, '');

  renderHeadline(p.headline || '', p.name || '');
  setText('intro', p.intro);
  setText('education', p.education);
  setText('skills', p.skills);
  setText('experience', p.experience);
  setText('quote', p.quote ? '“' + p.quote + '”' : '');
}

// 한 줄 소개 안의 이름에 파란 밑줄을 긋는다
function renderHeadline(headline, name) {
  const box = document.getElementById('headline');
  box.textContent = '';
  if (!name || !headline.includes(name)) {
    box.textContent = headline;
    return;
  }
  headline.split(name).forEach((part, index) => {
    if (index > 0) box.append(el('span', 'underline', name));
    box.append(part);
  });
}

// ===== 포트폴리오 카드 =====
function renderProjects(projects, likeCounts) {
  const box = document.getElementById('cards');
  box.textContent = '';

  if (projects.length === 0) {
    box.append(el('p', 'status', '아직 등록된 프로젝트가 없습니다.'));
    return;
  }

  projects.forEach((project) => {
    box.append(createCard(project, likeCounts[project.id] || 0));
  });
}

function createCard(project, likeCount) {
  const card = el('article', 'card');

  // 누르면 열 주소: 첨부 파일이 있으면 파일, 없으면 썸네일
  const openUrl = safeUrl(project.file_url) || safeUrl(project.thumbnail_url);
  const link = el(openUrl ? 'a' : 'div', 'card-link');
  if (openUrl) {
    link.href = openUrl;
    link.target = '_blank';
    link.rel = 'noopener';
  }

  // 브라우저 창 모양 썸네일
  const browser = el('div', 'browser');
  const bar = el('div', 'browser-bar');
  bar.append(el('span'), el('span'), el('span'));
  const view = el('div', 'browser-view');
  const thumbUrl = safeUrl(project.thumbnail_url);
  if (thumbUrl) {
    const img = el('img');
    img.src = thumbUrl;
    img.alt = project.title + ' 썸네일';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove()); // 못 불러오면 회색 자리
    view.append(img);
  }
  browser.append(bar, view);

  // 글자 부분
  const body = el('div', 'card-body');
  const meta = [project.number, project.category].filter(Boolean).join(' · ');
  body.append(
    el('p', 'card-meta', meta),
    el('h4', 'card-title', project.title),
    el('p', 'card-desc', project.description)
  );
  const tags = el('div', 'tags');
  (project.tags || []).forEach((tag) => tags.append(el('span', 'tag', tag)));
  body.append(tags);

  link.append(browser, body);

  // 좋아요
  const foot = el('div', 'card-foot');
  foot.append(createLikeButton(project.id, likeCount));

  card.append(link, foot);
  return card;
}

function createLikeButton(projectId, startCount) {
  let count = startCount;
  const liked = loadLocal('resume_liked', []);

  const button = el('button', 'like');
  button.type = 'button';
  const number = el('span', 'like-count', String(count));
  button.innerHTML = HEART_ICON;
  button.append(number);

  function showLiked() {
    button.classList.add('liked');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', '좋아요 누름, ' + count + '개');
  }

  if (liked.includes(projectId)) {
    showLiked();
  } else {
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', '좋아요, ' + count + '개');
  }

  button.addEventListener('click', async () => {
    if (button.classList.contains('liked') || button.disabled) return;
    button.disabled = true;
    try {
      await api('likes', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: { project_id: projectId, client_id: getClientId() }
      });
      count += 1;
      number.textContent = String(count);
      rememberLike(projectId);
      showLiked();
    } catch (error) {
      if (error.code === '23505') {
        // 이 브라우저는 이미 눌렀던 카드
        rememberLike(projectId);
        showLiked();
      } else {
        alert('좋아요를 남기지 못했습니다. 잠시 후 다시 눌러 주세요.');
      }
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function rememberLike(projectId) {
  const liked = loadLocal('resume_liked', []);
  if (!liked.includes(projectId)) {
    liked.push(projectId);
    saveLocal('resume_liked', liked);
  }
}

// ===== 방명록 =====
function createGuestbookItem(entry) {
  const item = el('li', 'guestbook-item');
  const head = el('div', 'guestbook-item-head');
  const date = new Date(entry.created_at);
  head.append(
    el('span', 'guestbook-nick', entry.nickname),
    el('span', 'guestbook-date', isNaN(date) ? '' : date.toLocaleDateString('ko-KR'))
  );
  item.append(head, el('p', 'guestbook-text', entry.message));
  return item;
}

function renderGuestbook(entries) {
  const list = document.getElementById('guestbook-list');
  list.textContent = '';
  if (entries.length === 0) {
    list.append(el('li', 'status', '아직 남겨진 글이 없습니다. 첫 글을 남겨 주세요!'));
    return;
  }
  entries.forEach((entry) => list.append(createGuestbookItem(entry)));
}

function setGuestbookStatus(text, isError) {
  const status = document.getElementById('gb-status');
  status.textContent = text;
  status.classList.toggle('error', Boolean(isError));
}

async function submitGuestbook() {
  const nicknameInput = document.getElementById('gb-nickname');
  const messageInput = document.getElementById('gb-message');
  const button = document.getElementById('gb-submit');
  const nickname = nicknameInput.value.trim();
  const message = messageInput.value.trim();

  if (!nickname || !message) {
    setGuestbookStatus('별명과 한마디를 모두 적어 주세요.', true);
    return;
  }
  if (nickname.length > 20 || message.length > 200) {
    setGuestbookStatus('별명은 20자, 한마디는 200자까지 쓸 수 있어요.', true);
    return;
  }

  button.disabled = true;
  setGuestbookStatus('남기는 중…');
  try {
    const rows = await api('resume_guestbook', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { nickname, message }
    });
    const list = document.getElementById('guestbook-list');
    const empty = list.querySelector('.status');
    if (empty) empty.remove();
    list.prepend(createGuestbookItem(rows[0]));
    messageInput.value = '';
    setGuestbookStatus('남겼습니다. 고마워요!');
  } catch {
    setGuestbookStatus('남기지 못했습니다. 잠시 후 다시 해 주세요.', true);
  } finally {
    button.disabled = false;
  }
}

// ===== 처음 열 때 모두 불러오기 =====
async function start() {
  document.getElementById('gb-submit').addEventListener('click', submitGuestbook);
  document.getElementById('gb-message').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) submitGuestbook();
  });

  const [profile, projects, likes, guestbook] = await Promise.allSettled([
    api('profile?select=*&id=eq.1'),
    api('projects?select=*&order=sort_order.asc,id.asc'),
    api('likes?select=project_id'),
    api('resume_guestbook?select=*&order=created_at.desc')
  ]);

  if (profile.status === 'fulfilled') {
    renderProfile(profile.value[0]);
  } else {
    renderProfile(null);
    setText('headline', '프로필을 불러오지 못했습니다.');
  }

  // 카드별 좋아요 수 세기
  const likeCounts = {};
  if (likes.status === 'fulfilled') {
    likes.value.forEach((row) => {
      likeCounts[row.project_id] = (likeCounts[row.project_id] || 0) + 1;
    });
  }

  if (projects.status === 'fulfilled') {
    renderProjects(projects.value, likeCounts);
  } else {
    const box = document.getElementById('cards');
    box.textContent = '';
    box.append(el('p', 'status', '프로젝트를 불러오지 못했습니다.'));
  }

  if (guestbook.status === 'fulfilled') {
    renderGuestbook(guestbook.value);
  } else {
    const list = document.getElementById('guestbook-list');
    list.textContent = '';
    list.append(el('li', 'status', '방명록을 불러오지 못했습니다.'));
  }
}

start();
