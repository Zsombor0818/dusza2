const $ = id => document.getElementById(id);

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

function message(text, type) {
  $('authMsg').textContent = text;
  $('authMsg').className = 'msg ' + (type || '');
}

function showForm(name) {
  const login = name === 'login';
  $('loginTab').setAttribute('aria-selected', login);
  $('registerTab').setAttribute('aria-selected', !login);
  $('loginForm').hidden = !login;
  $('registerForm').hidden = login;
  message('');
  $(login ? 'loginUser' : 'regUser').focus();
}

$('loginTab').onclick = () => showForm('login');
$('registerTab').onclick = () => showForm('register');

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const data = await post('/api/login', { username: $('loginUser').value, password: $('loginPass').value });
    localStorage.setItem('token', data.token);
    location.href = '/';
  } catch (err) {
    message(err.message, 'error');
  }
};

$('registerForm').onsubmit = async e => {
  e.preventDefault();
  if ($('regPass').value !== $('regPass2').value) return message('A két jelszó nem egyezik.', 'error');
  try {
    await post('/api/register', { username: $('regUser').value, password: $('regPass').value });
    const username = $('regUser').value;
    $('registerForm').reset();
    showForm('login');
    $('loginUser').value = username;
    $('loginPass').focus();
    message('Sikeres regisztráció, most már bejelentkezhetsz.', 'ok');
  } catch (err) {
    message(err.message, 'error');
  }
};
