import { Chess } from 'chess.js';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const { REPO = 'vihanga2k5/vihanga2k5', ISSUE_NUMBER, ISSUE_TITLE = '', ISSUE_USER = '' } = process.env;
const STATE = 'chess/state.json';
const HISTORY = 'chess/history.json';

const read = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const save = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');

let state = read(STATE, { game: 1, moves: [], last: '' });
const history = read(HISTORY, []);

// ---------- helpers ----------
function gh(...args) {
  try {
    execFileSync('gh', [...args, '--repo', REPO], { stdio: 'inherit' });
  } catch (e) {
    console.error('gh failed:', e.message);
  }
}

function reply(body, reason = 'completed') {
  if (!ISSUE_NUMBER) return;
  gh('issue', 'comment', ISSUE_NUMBER, '--body', body);
  gh('issue', 'close', ISSUE_NUMBER, '--reason', reason);
}

function replay() {
  const c = new Chess();
  for (const m of state.moves) {
    c.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
  }
  return c;
}

function resultText(c) {
  if (c.isCheckmate()) return `${c.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`;
  if (c.isStalemate()) return 'Draw by stalemate';
  return 'Draw';
}

// ---------- rendering ----------
const PIECES = JSON.parse(fs.readFileSync('chess/pieces.json', 'utf8'));

// Board colors inspired by chess.com's classic green theme
const LIGHT = '#EEEED2', DARK = '#769656', HL_LIGHT = '#F5F682', HL_DARK = '#BACA2B';

function boardSvg(c) {
  const S = 100, W = S * 8;
  const last = state.moves.at(-1)?.uci;
  const hl = last ? [last.slice(0, 2), last.slice(2, 4)] : [];
  const b = c.board();
  const defs = Object.entries(PIECES).map(([k, v]) => `<symbol id="${k}" viewBox="0 0 45 45">${v}</symbol>`).join('');
  let sq = '', pc = '', lb = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const name = 'abcdefgh'[f] + (8 - r);
      const light = (r + f) % 2 === 0;
      const fill = hl.includes(name) ? (light ? HL_LIGHT : HL_DARK) : (light ? LIGHT : DARK);
      const x = f * S, y = r * S;
      sq += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${fill}"/>`;
      const label = light ? DARK : LIGHT;
      if (f === 0) lb += `<text x="${x + 7}" y="${y + 24}" font-size="22" font-weight="700" fill="${label}">${8 - r}</text>`;
      if (r === 7) lb += `<text x="${x + S - 7}" y="${y + S - 8}" font-size="22" font-weight="700" text-anchor="end" fill="${label}">${'abcdefgh'[f]}</text>`;
      const p = b[r][f];
      if (p) {
        if (p.type === 'k' && p.color === c.turn() && c.isCheck()) {
          sq += `<circle cx="${x + S / 2}" cy="${y + S / 2}" r="${S / 2}" fill="url(#chk)"/>`;
        }
        pc += `<use href="#${p.color}${p.type.toUpperCase()}" x="${x}" y="${y}" width="${S}" height="${S}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" font-family="Arial, Helvetica, sans-serif">` +
    `<defs><clipPath id="r"><rect width="${W}" height="${W}" rx="12"/></clipPath>` +
    `<radialGradient id="chk"><stop offset="0" stop-color="#ff0000" stop-opacity="0.9"/><stop offset="0.25" stop-color="#e70000" stop-opacity="0.8"/><stop offset="0.89" stop-color="#a90000" stop-opacity="0"/></radialGradient>` +
    `${defs}</defs><g clip-path="url(#r)">${sq}${pc}${lb}</g></svg>\n`;
}

function section(c) {
  const base = `https://github.com/${REPO}/issues/new`;
  const body = encodeURIComponent('Just click "Submit new issue". You only get one move per game, so make it count! ♟️');
  const link = (uci, san) => `[${san}](${base}?title=${encodeURIComponent('chess|move|' + uci)}&body=${body})`;

  const names = { p: '♟ Pawn', n: '♞ Knight', b: '♝ Bishop', r: '♜ Rook', q: '♛ Queen', k: '♚ King' };
  const groups = {};
  for (const m of c.moves({ verbose: true })) {
    (groups[m.piece] ??= []).push(link(m.from + m.to + (m.promotion || ''), m.san));
  }
  const rows = Object.keys(names).filter((k) => groups[k]).map((k) => `| ${names[k]} | ${groups[k].join(' · ')} |`).join('\n');

  const n = state.moves.length;
  const players = new Set(state.moves.map((m) => m.user.toLowerCase())).size;
  const turn = c.turn() === 'w' ? 'White ⚪' : 'Black ⚫';
  const status = `**Game #${state.game}** · **${turn} to move**${c.isCheck() ? ' · ⚠️ **Check!**' : ''} · ${players} player${players === 1 ? '' : 's'} so far`;

  const log = state.moves.slice(-10).reverse()
    .map((m, i) => `| ${n - i} | ${m.color === 'w' ? '⚪' : '⚫'} \`${m.san}\` | [@${m.user}](https://github.com/${m.user}) |`)
    .join('\n');

  return `<div align="center">

<img src="chess/board.svg?v=${state.game}-${n}" width="560" alt="Community chess board" />

${status}${state.last ? `<br/>🏁 ${state.last}` : ''}

<details>
<summary><b>♟️ Play your move</b></summary>

<br/>

Pick a move below. It opens a pre-filled GitHub issue, press **Submit new issue** and the bot plays it within a minute. **Everyone gets one move per game**, and your username is recorded.

| Piece | Legal moves |
| :-- | :-- |
${rows}

${n ? `**📜 Latest moves**\n\n| # | Move | Played by |\n| :-: | :-: | :-- |\n${log}` : '_No moves yet — be the first to play!_'}

</details>

</div>`;
}

function render(c) {
  save(STATE, state);
  save(HISTORY, history);
  fs.writeFileSync('chess/board.svg', boardSvg(c));
  fs.writeFileSync('README.md', section(c) + '\n');
}

// ---------- main ----------
let chess = replay();

if (ISSUE_NUMBER) {
  const m = /^chess\|move\|([a-h][1-8][a-h][1-8][qrbn]?)$/.exec(ISSUE_TITLE.trim());
  const user = ISSUE_USER;

  if (!m) {
    reply('❌ That doesn\'t look like a move. Please use the move links in the README.', 'not planned');
  } else if (state.moves.some((x) => x.user.toLowerCase() === user.toLowerCase())) {
    reply(`⏳ @${user}, you've already played a move in this game. Everyone gets just one. Come back for the next game!`, 'not planned');
  } else {
    const uci = m[1];
    let mv = null;
    try {
      mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      mv = null;
    }
    if (!mv) {
      reply('❌ That move is not legal right now (the board may have changed). Please pick a fresh one from the README.', 'not planned');
    } else {
      state.moves.push({ uci, san: mv.san, color: mv.color, user, at: new Date().toISOString() });
      let msg = `♟️ @${user} played **${mv.san}**. Thanks for playing!`;
      if (chess.isGameOver()) {
        const result = resultText(chess);
        history.push({ game: state.game, result, moves: state.moves });
        state = { game: state.game + 1, moves: [], last: `Game #${state.game}: ${result} 🎉` };
        chess = new Chess();
        msg += `\n\n🏁 **${result}!** A brand new game has started, everyone can play again.`;
      }
      reply(msg);
    }
  }
}

render(chess);
