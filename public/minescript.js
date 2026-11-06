const MineScript = (() => {
  const KEYWORDS = ['and', 'by', 'else', 'false', 'forward', 'here', 'if', 'isthere', 'mine', 'not', 'or', 'print', 'set', 'step', 'to', 'true', 'turn', 'while'];
  const BINOPS = ['+', '-', '*', '=', '<>', '<', '<=', '>', '>=', 'and', 'or'];
  const DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const ROBOTS = ['>', '^', '<', 'v'];
  const MAX_STEPS = 1000;

  class ScriptError extends Error {
    constructor(line, message, code) {
      super(message);
      this.line = line;
      this.code = code || 'SYNTAX_ERROR';
    }
  }

  function parse(text) {
    const raw = String(text).replace(/\r/g, '').split('\n');
    if (raw[raw.length - 1] === '') raw.pop();

    const lines = raw.map((s, i) => {
      const n = i + 1;
      if (s.trim() === '') throw new ScriptError(n, 'Üres sor nem megengedett.');
      if (s.includes('\t')) throw new ScriptError(n, 'Tabulátor nem használható, csak szóköz.');
      const indent = s.match(/^ */)[0].length;
      const tokens = s.slice(indent).split(' ');
      if (tokens.includes('')) throw new ScriptError(n, 'A tokeneket pontosan egy szóköz választhatja el.');
      return { n, indent, tokens };
    });

    let pos = 0;

    function simpleval(tok, n) {
      if (/^\d+$/.test(tok)) {
        const value = Number(tok);
        if (value > 100) throw new ScriptError(n, `A szám 0 és 100 között lehet: ${tok}`);
        return { kind: 'num', value };
      }
      if (tok === 'true' || tok === 'false') return { kind: 'bool', value: tok === 'true' };
      return { kind: 'var', name: ident(tok, n) };
    }

    function ident(tok, n) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(tok)) throw new ScriptError(n, `Érvénytelen érték vagy azonosító: "${tok}"`);
      if (KEYWORDS.includes(tok.toLowerCase())) throw new ScriptError(n, `Kulcsszó nem lehet azonosító: "${tok}"`);
      return tok;
    }

    function calc(ts, n) {
      if (ts.length === 1) return { kind: 'val', a: simpleval(ts[0], n) };
      if (ts.length === 2 && ts[0] === 'isThere') return { kind: 'isThere', a: simpleval(ts[1], n) };
      if (ts.length === 2 && ts[0] === 'not') return { kind: 'not', a: simpleval(ts[1], n) };
      if (ts.length === 3 && BINOPS.includes(ts[1])) {
        return { kind: 'bin', op: ts[1], a: simpleval(ts[0], n), b: simpleval(ts[2], n) };
      }
      throw new ScriptError(n, 'Hibás kifejezés a "to" után.');
    }

    function command(L) {
      const t = L.tokens;
      const n = L.n;
      const bad = format => new ScriptError(n, `Hibás utasítás, helyes alak: ${format}`);
      switch (t[0]) {
        case 'step':
          if (t.length !== 3 || t[1] !== 'forward') throw bad('step forward <érték>');
          return { type: 'step', line: n, a: simpleval(t[2], n) };
        case 'turn':
          if (t.length !== 3 || t[1] !== 'by') throw bad('turn by <érték>');
          return { type: 'turn', line: n, a: simpleval(t[2], n) };
        case 'mine':
          if (t.length !== 2 || t[1] !== 'here') throw bad('mine here');
          return { type: 'mine', line: n };
        case 'print':
          if (t.length !== 2) throw bad('print <érték>');
          return { type: 'print', line: n, a: simpleval(t[1], n) };
        case 'if':
        case 'while':
          if (t.length !== 2) throw bad(`${t[0]} <feltétel>`);
          return { type: t[0], line: n, a: simpleval(t[1], n) };
        case 'set':
          if (t.length < 4 || t[2] !== 'to') throw bad('set <változó> to <kifejezés>');
          return { type: 'set', line: n, name: ident(t[1], n), expr: calc(t.slice(3), n) };
        case 'else':
          throw new ScriptError(n, 'Az else-hez nem tartozik if, vagy hibás a behúzása.');
        default:
          throw new ScriptError(n, `Ismeretlen utasítás: "${t[0]}"`);
      }
    }

    function body(indent) {
      if (pos < lines.length && lines[pos].indent > indent) return block(lines[pos].indent);
      return [];
    }

    function block(indent) {
      const cmds = [];
      while (pos < lines.length && lines[pos].indent >= indent) {
        const L = lines[pos];
        if (L.indent > indent) throw new ScriptError(L.n, 'Hibás behúzás: a blokkon belül nem egységes.');
        pos++;
        const cmd = command(L);
        if (cmd.type === 'if' || cmd.type === 'while') {
          cmd.body = body(indent);
          const next = lines[pos];
          if (cmd.type === 'if' && next && next.indent === indent && next.tokens[0] === 'else') {
            if (next.tokens.length !== 1) throw new ScriptError(next.n, 'Az else sorában más nem állhat.');
            pos++;
            cmd.elseLine = next.n;
            cmd.elseBody = body(indent);
          }
        }
        cmds.push(cmd);
      }
      return cmds;
    }

    return block(0);
  }

  function createRun(program, mapData) {
    const grid = mapData.grid.map(row => row.slice());
    const state = {
      grid, rows: mapData.rows, cols: mapData.cols,
      r: 0, c: 0, dir: 0, gold: 0, steps: 0, line: null,
      vars: new Map(), explored: new Set(), output: []
    };
    grid.forEach((row, r) => row.forEach((ch, c) => {
      if (ROBOTS.includes(ch)) {
        state.r = r;
        state.c = c;
        state.dir = ROBOTS.indexOf(ch);
        row[c] = '.';
      }
    }));
    state.explored.add(`${state.r},${state.c}`);

    const fail = (code, line, msg) => { throw new ScriptError(line, msg, code); };
    const typeOf = v => typeof v === 'number' ? 'int' : 'bool';

    function count(line) {
      if (state.steps >= MAX_STEPS) fail('INSTRUCTION_COUNT_LIMIT_EXCEEDED', line, 'Túllépte az 1000 feldolgozható programsort.');
      state.steps++;
      state.line = line;
    }

    function read(sv, line) {
      if (sv.kind !== 'var') return sv.value;
      if (!state.vars.has(sv.name)) fail('E_UNINITIALIZED', line, `A(z) "${sv.name}" változónak még nincs értéke.`);
      return state.vars.get(sv.name);
    }

    function front() {
      return [state.r + DIRS[state.dir][0], state.c + DIRS[state.dir][1]];
    }

    function inside(r, c) {
      return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
    }

    function intArg(sv, line, allowed) {
      const v = read(sv, line);
      if (typeof v !== 'number' || v < 0 || (allowed && !allowed.includes(v))) {
        fail('E_BAD_ARG', line, `Érvénytelen paraméter: ${v}`);
      }
      return v;
    }

    function operand(v, op, line) {
      const needInt = ['+', '-', '*', '<', '<=', '>', '>='].includes(op);
      const needBool = ['and', 'or', 'not'].includes(op);
      if ((needInt && typeof v !== 'number') || (needBool && typeof v !== 'boolean')) {
        fail('E_BAD_OPERAND', line, `Rossz operandustípus a(z) "${op}" művelethez.`);
      }
      return v;
    }

    function evaluate(e, line) {
      if (e.kind === 'val') return read(e.a, line);
      if (e.kind === 'not') return !operand(read(e.a, line), 'not', line);
      if (e.kind === 'isThere') {
        const w = intArg(e.a, line, [0, 1, 2]);
        const [r, c] = front();
        if (!inside(r, c)) return w === 1;
        state.explored.add(`${r},${c}`);
        const cell = state.grid[r][c];
        return (w === 0 && cell === '.') || (w === 1 && cell === '#') || (w === 2 && cell === '@');
      }
      const a = operand(read(e.a, line), e.op, line);
      const b = operand(read(e.b, line), e.op, line);
      switch (e.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
        case 'and': return a && b;
        case 'or': return a || b;
      }
      if (typeof a !== typeof b) fail('E_BAD_OPERAND', line, `Az "${e.op}" két oldalán eltérő típus áll.`);
      return e.op === '=' ? a === b : a !== b;
    }

    function condition(sv, line) {
      const v = read(sv, line);
      if (typeof v !== 'boolean') fail('E_NON_BOOL_CONDITION', line, 'A feltétel nem logikai érték.');
      return v;
    }

    function* run(cmds) {
      for (const cmd of cmds) {
        const line = cmd.line;
        if (cmd.type === 'while') {
          while (true) {
            count(line);
            const ok = condition(cmd.a, line);
            yield state;
            if (!ok) break;
            yield* run(cmd.body);
          }
          continue;
        }
        count(line);
        if (cmd.type === 'if') {
          const ok = condition(cmd.a, line);
          yield state;
          if (ok) {
            yield* run(cmd.body);
          } else if (cmd.elseBody) {
            count(cmd.elseLine);
            yield state;
            yield* run(cmd.elseBody);
          }
          continue;
        }
        if (cmd.type === 'set') {
          const v = evaluate(cmd.expr, line);
          if (state.vars.has(cmd.name) && typeOf(state.vars.get(cmd.name)) !== typeOf(v)) {
            fail('E_TYPE_MISMATCH', line, `A(z) "${cmd.name}" változó típusa nem változtatható.`);
          }
          state.vars.set(cmd.name, v);
        } else if (cmd.type === 'step') {
          const n = intArg(cmd.a, line);
          for (let i = 0; i < n; i++) {
            const [r, c] = front();
            if (!inside(r, c) || state.grid[r][c] === '#') fail('E_BEDROCK_HIT', line, 'A robot falba ütközne vagy lelépne a térképről.');
            state.r = r;
            state.c = c;
            state.explored.add(`${r},${c}`);
          }
        } else if (cmd.type === 'turn') {
          state.dir = (state.dir + intArg(cmd.a, line)) % 4;
        } else if (cmd.type === 'mine') {
          if (state.grid[state.r][state.c] !== '@') fail('E_NO_GOLD', line, 'Ezen a mezőn nincs arany.');
          state.grid[state.r][state.c] = '.';
          state.gold++;
        } else if (cmd.type === 'print') {
          state.output.push(String(read(cmd.a, line)));
        }
        yield state;
      }
    }

    return { state, iterator: run(program), robotSymbol: () => ROBOTS[state.dir] };
  }

  return { parse, createRun, ScriptError };
})();

if (typeof module !== 'undefined') module.exports = MineScript;
