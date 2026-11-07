const $ = id => document.getElementById(id);

const robot = document.querySelector('.robot');
const robotArea = document.querySelector('.robot-area');

if (robot && robotArea) {
  robotArea.addEventListener('mousemove', event => {
    const rect = robotArea.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateY = ((event.clientX - rect.left - centerX) / centerX) * 4;
    const rotateX = ((centerY - (event.clientY - rect.top)) / centerY) * 3;
    robot.style.transform = `translateX(-50%) translateY(-7px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  robotArea.addEventListener('mouseleave', () => {
    robot.style.transform = 'translateX(-50%) translateY(0) rotateX(0) rotateY(0)';
  });
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Hiba történt.');
  return data;
}

function message(text, type = '') {
  $('authMsg').textContent = text;
  $('authMsg').className = 'msg ' + type;
}

const loginTab = $('loginTab');
const registerTab = $('registerTab');
const loginForm = $('loginForm');
const registerForm = $('registerForm');

function switchForm(type) {
  const isLogin = type === 'login';
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  loginTab.setAttribute('aria-selected', String(isLogin));
  registerTab.setAttribute('aria-selected', String(!isLogin));
  message('');
  $(isLogin ? 'loginUser' : 'regUser').focus();
}

loginTab.addEventListener('click', () => switchForm('login'));
registerTab.addEventListener('click', () => switchForm('register'));

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const data = await post('/api/login', {
      username: $('loginUser').value.trim(),
      password: $('loginPass').value
    });
    if (!data.token) throw new Error('A szerver nem küldött tokent.');
    localStorage.setItem('token', data.token);
    location.href = '/';
  } catch (err) {
    message(err.message, 'error');
  }
});

registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  const username = $('regUser').value.trim();
  const password = $('regPass').value;
  if (password !== $('regPass2').value) {
    return message('A két jelszó nem egyezik.', 'error');
  }
  try {
    await post('/api/register', { username, password });
    registerForm.reset();
    switchForm('login');
    $('loginUser').value = username;
    $('loginPass').focus();
    message('Sikeres regisztráció, most már bejelentkezhetsz.', 'ok');
  } catch (err) {
    message(err.message, 'error');
  }
});
