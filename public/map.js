const MapFormat = {
  symbols: ['.', '@', '#', '>', '<', '^', 'v'],
  robots: ['>', '^', '<', 'v'],

  parse(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const head = lines[0].split(' ');
    if (head.length !== 2 || !/^\d+$/.test(head[0]) || !/^\d+$/.test(head[1])) {
      throw new Error('Az első sornak két, szóközzel elválasztott egész számot kell tartalmaznia.');
    }
    const rows = Number(head[0]);
    const cols = Number(head[1]);
    if (rows < 1 || rows > 15 || cols < 1 || cols > 15) {
      throw new Error('A térkép mindkét mérete 1 és 15 között lehet.');
    }
    if (lines.length - 1 !== rows) {
      throw new Error(`A térképnek ${rows} sorból kell állnia, de ${lines.length - 1} sor található.`);
    }
    const grid = [];
    let robotCount = 0;
    for (let r = 0; r < rows; r++) {
      const line = lines[r + 1];
      if (line.length !== cols) {
        throw new Error(`A(z) ${r + 2}. sor hossza ${line.length}, de ${cols} kellene.`);
      }
      const row = line.split('');
      row.forEach((ch, c) => {
        if (!this.symbols.includes(ch)) {
          throw new Error(`Ismeretlen jel a(z) ${r + 2}. sor ${c + 1}. oszlopában: "${ch}"`);
        }
        if (this.robots.includes(ch)) robotCount++;
      });
      grid.push(row);
    }
    if (robotCount !== 1) {
      throw new Error(`A térképen pontosan egy robotnak kell lennie (most ${robotCount} van).`);
    }
    return { rows, cols, grid };
  },

  stringify(grid) {
    return `${grid.length} ${grid[0].length}\n` + grid.map(row => row.join('')).join('\n');
  }
};

if (typeof module !== 'undefined') module.exports = MapFormat;
