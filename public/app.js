const $ = id => document.getElementById(id);
const SYMBOLS = { '.': '', '@': '◆', '#': '', '>': '▶', '<': '◀', '^': '▲', 'v': '▼' };
const CLASSES = { '.': 'empty', '@': 'gold', '#': 'wall', '>': 'robot', '<': 'robot', '^': 'robot', 'v': 'robot' };
const NAMES = { '.': 'üres', '@': 'arany', '#': 'fal', '>': 'robot kelet felé', '<': 'robot nyugat felé', '^': 'robot észak felé', 'v': 'robot dél felé' };

let token = localStorage.getItem('token');
let me = null;
let maps = [];
let running = false;
let stopRequested = false;
let editGrid = [];
let editId = null;

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) toLogin();
  if (!res.ok) throw new Error(data.error || 'Hiba történt.');
  return data;
}

function message(id, text, type) {
  $(id).textContent = text;
  $(id).className = 'msg ' + (type || '');
}

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function readFile(input, callback) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(reader.result, file.name.replace(/\.[^.]*$/, ''));
  reader.readAsText(file);
}

function renderGrid(container, grid, options = {}) {
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${grid[0].length}, minmax(0, 2.2rem))`;
  grid.forEach((row, r) => row.forEach((ch, c) => {
    const cell = document.createElement(options.onClick ? 'button' : 'div');
    cell.className = 'cell ' + CLASSES[ch];
    cell.textContent = SYMBOLS[ch];
    if (options.explored && !options.explored.has(`${r},${c}`)) cell.classList.add('unexplored');
    if (options.onClick) {
      cell.type = 'button';
      cell.setAttribute('aria-label', `${r + 1}. sor, ${c + 1}. oszlop: ${NAMES[ch]}`);
      cell.onclick = () => options.onClick(r, c);
    }
    container.appendChild(cell);
  }));
}

function toLogin() {
  localStorage.removeItem('token');
  location.href = '/login.html';
}

async function init() {
  if (!token) return toLogin();
  try {
    me = await api('GET', '/api/me');
  } catch (e) {
    return toLogin();
  }
  $('userName').textContent = me.username;
  $('userBox').hidden = false;
  await loadMaps();
  showGameMap();
  newEditGrid();
  loadBoard();
  updateCodeView();
}

$('logoutBtn').onclick = async () => {
  stopRequested = true;
  await api('POST', '/api/logout').catch(() => {});
  toLogin();
};

document.querySelectorAll('[role=tab]').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('[role=tab]').forEach(t => t.setAttribute('aria-selected', t === tab));
    document.querySelectorAll('.tab').forEach(panel => { panel.hidden = panel.id !== tab.dataset.tab; });
    if (tab.dataset.tab === 'boardTab') loadBoard();
  };
});

async function loadMaps() {
  maps = await api('GET', '/api/maps');
  for (const id of ['gameMap', 'editSelect', 'boardMap']) {
    const select = $(id);
    const old = select.value;
    select.innerHTML = id === 'editSelect' ? '<option value="">— Új térkép —</option>' : '';
    maps.forEach(m => select.add(new Option(`${m.name} (${m.owner})`, m.id)));
    if ([...select.options].some(o => o.value === old)) select.value = old;
  }
}

function selectedMap() {
  return maps.find(m => String(m.id) === $('gameMap').value);
}

function renderState(state, symbol) {
  const grid = state.grid.map(row => row.slice());
  grid[state.r][state.c] = symbol;
  renderGrid($('gameGrid'), grid, { explored: state.explored });
  $('statGold').textContent = state.gold;
  $('statSteps').textContent = state.steps;
  $('statLine').textContent = state.line || '-';
}

function showGameMap() {
  const map = selectedMap();
  if (!map) {
    $('gameGrid').innerHTML = '<p>Nincs még térkép. Készíts egyet a térképszerkesztőben!</p>';
    return;
  }
  const run = MineScript.createRun([], MapFormat.parse(map.data));
  renderState(run.state, run.robotSymbol());
}

$('gameMap').onchange = () => {
  showGameMap();
  $('boardMap').value = $('gameMap').value;
};

function updateCodeView(current, errorLine) {
  const view = $('codeView');
  view.innerHTML = '';
  $('code').value.replace(/\r/g, '').split('\n').forEach((text, i) => {
    const li = document.createElement('li');
    li.textContent = text || ' ';
    if (i + 1 === current) li.className = 'current';
    if (i + 1 === errorLine) li.className = 'error';
    view.appendChild(li);
  });
  const marked = view.querySelector('.current, .error');
  if (marked) marked.scrollIntoView({ block: 'nearest' });
}

$('code').oninput = () => updateCodeView();

function checkSyntax() {
  try {
    const program = MineScript.parse($('code').value);
    updateCodeView();
    return program;
  } catch (e) {
    message('gameMsg', `Szintaktikai hiba a(z) ${e.line}. sorban: ${e.message}`, 'error');
    updateCodeView(null, e.line);
    return null;
  }
}

$('checkBtn').onclick = () => {
  if (checkSyntax()) message('gameMsg', 'A program szintaktikailag helyes.', 'ok');
};

$('codeImport').onchange = e => readFile(e.target, text => {
  try {
    MineScript.parse(text);
    $('code').value = text.replace(/\r/g, '');
    updateCodeView();
    message('gameMsg', 'A program betöltve.', 'ok');
  } catch (err) {
    message('gameMsg', `A fájl nem tölthető be, hiba a(z) ${err.line}. sorban: ${err.message}`, 'error');
  }
});

$('codeExport').onclick = () => download('program.txt', $('code').value);

function setRunning(value) {
  running = value;
  $('runBtn').disabled = value;
  $('stopBtn').disabled = !value;
  $('code').readOnly = value;
  $('gameMap').disabled = value;
  $('codeImport').disabled = value;
}

$('stopBtn').onclick = () => { stopRequested = true; };

$('runBtn').onclick = async () => {
  const map = selectedMap();
  if (!map) return message('gameMsg', 'Válassz térképet!', 'error');
  const program = checkSyntax();
  if (!program) return;

  const run = MineScript.createRun(program, MapFormat.parse(map.data));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let printed = 0;
  $('console').textContent = '';
  stopRequested = false;
  setRunning(true);
  message('gameMsg', 'Fut a program...');
  renderState(run.state, run.robotSymbol());
  await sleep(Number($('speed').value));

  try {
    for (const state of run.iterator) {
      renderState(state, run.robotSymbol());
      updateCodeView(state.line);
      while (printed < state.output.length) $('console').textContent += state.output[printed++] + '\n';
      await sleep(Number($('speed').value));
      if (stopRequested) break;
    }
    if (stopRequested) {
      message('gameMsg', 'A futást leállítottad, az eredmény nem került a ranglistára.');
    } else {
      message('gameMsg', `A program sikeresen lefutott. Arany: ${run.state.gold}, lépés: ${run.state.steps}.`, 'ok');
    }
  } catch (e) {
    renderState(run.state, run.robotSymbol());
    updateCodeView(null, e.line);
    message('gameMsg', `Hiba: ${e.code} a(z) ${e.line}. sorban. ${e.message}`, 'error');
  }

  if (!stopRequested) {
    await api('POST', '/api/results', { mapId: map.id, gold: run.state.gold, steps: run.state.steps })
      .catch(err => message('gameMsg', err.message, 'error'));
  }
  setRunning(false);
};

function newEditGrid(rows = 5, cols = 5) {
  editId = null;
  editGrid = Array.from({ length: rows }, () => Array(cols).fill('.'));
  editGrid[0][0] = '>';
  $('editSelect').value = '';
  $('editName').value = '';
  renderEditor();
}

function renderEditor() {
  $('editRows').value = editGrid.length;
  $('editCols').value = editGrid[0].length;
  const map = maps.find(m => m.id === editId);
  const own = !map || map.owner === me.username;
  $('saveMapBtn').disabled = !own;
  $('deleteMapBtn').disabled = !map || !own;
  renderGrid($('editGrid'), editGrid, { onClick: placeTool });
}

function placeTool(r, c) {
  const tool = document.querySelector('input[name=tool]:checked').value;
  if (MapFormat.robots.includes(tool)) {
    editGrid.forEach(row => row.forEach((ch, i) => { if (MapFormat.robots.includes(ch)) row[i] = '.'; }));
  }
  editGrid[r][c] = tool;
  renderEditor();
  $('editGrid').children[r * editGrid[0].length + c].focus();
}

$('editSelect').onchange = () => {
  const map = maps.find(m => String(m.id) === $('editSelect').value);
  if (!map) return newEditGrid();
  editId = map.id;
  editGrid = MapFormat.parse(map.data).grid;
  $('editName').value = map.name;
  message('editMsg', map.owner === me.username ? '' : 'Ez más térképe: csak újként mentheted.');
  renderEditor();
};

$('resizeBtn').onclick = () => {
  const rows = Number($('editRows').value);
  const cols = Number($('editCols').value);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || rows > 15 || cols < 1 || cols > 15) {
    return message('editMsg', 'A méret 1 és 15 között lehet.', 'error');
  }
  editGrid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (editGrid[r] && editGrid[r][c]) || '.'));
  message('editMsg', '');
  renderEditor();
};

async function saveMap(asNew) {
  const data = MapFormat.stringify(editGrid);
  try {
    MapFormat.parse(data);
    const body = { name: $('editName').value, data };
    if (editId && !asNew) {
      await api('PUT', `/api/maps/${editId}`, body);
    } else {
      editId = (await api('POST', '/api/maps', body)).id;
    }
    await loadMaps();
    $('editSelect').value = editId;
    renderEditor();
    showGameMap();
    message('editMsg', 'A térkép elmentve.', 'ok');
  } catch (e) {
    message('editMsg', e.message, 'error');
  }
}

$('saveMapBtn').onclick = () => saveMap(false);
$('saveNewMapBtn').onclick = () => saveMap(true);

$('deleteMapBtn').onclick = async () => {
  if (!editId || !confirm('Biztosan törlöd a térképet és az eredményeit?')) return;
  try {
    await api('DELETE', `/api/maps/${editId}`);
    await loadMaps();
    newEditGrid();
    showGameMap();
    loadBoard();
    message('editMsg', 'A térkép törölve.', 'ok');
  } catch (e) {
    message('editMsg', e.message, 'error');
  }
};

$('mapImport').onchange = e => readFile(e.target, (text, name) => {
  try {
    editGrid = MapFormat.parse(text).grid;
    editId = null;
    $('editSelect').value = '';
    $('editName').value = name;
    renderEditor();
    message('editMsg', 'A térkép betöltve, mentsd el!', 'ok');
  } catch (err) {
    message('editMsg', 'A fájl nem tölthető be: ' + err.message, 'error');
  }
});

$('mapExport').onclick = () => download(($('editName').value || 'terkep') + '.txt', MapFormat.stringify(editGrid));

async function loadBoard() {
  const body = $('boardBody');
  if (!$('boardMap').value) {
    body.innerHTML = '<tr><td colspan="5">Nincs térkép.</td></tr>';
    return;
  }
  const rows = await api('GET', `/api/leaderboard/${$('boardMap').value}`);
  body.innerHTML = '';
  if (!rows.length) body.innerHTML = '<tr><td colspan="5">Még nincs eredmény ezen a térképen.</td></tr>';
  rows.forEach((row, i) => {
    const tr = body.insertRow();
    [i + 1, row.username, row.gold, row.steps, new Date(row.created_at).toLocaleString('hu-HU')]
      .forEach(value => { tr.insertCell().textContent = value; });
  });
}

$('boardMap').onchange = loadBoard;

init();
