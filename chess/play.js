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
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

function boardSvg(c) {
  const S = 60, M = 24, W = S * 8 + M * 2;
  const last = state.moves.at(-1)?.uci;
  const hl = last ? [last.slice(0, 2), last.slice(2, 4)] : [];
  const b = c.board();
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}">`;
  o += `<rect width="${W}" height="${W}" rx="16" fill="#0D1117"/>`;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = 'abcdefgh'[f] + (8 - r);
      const light = (r + f) % 2 === 0;
      let fill = light ? '#e8f5ec' : '#3f9b64';
      if (hl.includes(sq)) fill = light ? '#aef0c1' : '#1DB954';
      const x = M + f * S, y = M + r * S;
      o += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${fill}"/>`;
      const p = b[r][f];
      if (p) {
        const w = p.color === 'w';
        o += `<text x="${x + S / 2}" y="${y + S / 2 + 2}" font-size="46" text-anchor="middle" dominant-baseline="central" font-family="'Segoe UI Symbol','Apple Symbols','DejaVu Sans',sans-serif" fill="${w ? '#ffffff' : '#111111'}" stroke="${w ? '#111111' : '#e8f5ec'}" stroke-width="1.2" paint-order="stroke">${GLYPH[p.type]}&#xFE0E;</text>`;
      }
    }
  }
  for (let i = 0; i < 8; i++) {
    const c1 = M + i * S + S / 2;
    o += `<text x="${c1}" y="${W - 7}" font-size="12" text-anchor="middle" fill="#8b949e" font-family="sans-serif">${'abcdefgh'[i]}</text>`;
    o += `<text x="${M / 2}" y="${c1 + 4}" font-size="12" text-anchor="middle" fill="#8b949e" font-family="sans-serif">${8 - i}</text>`;
  }
  return o + '</svg>\n';
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

${status}

<img src="chess/board.svg?v=${state.game}-${n}" width="480" alt="Chess board" />

${state.last ? `🏁 Last game — ${state.last}\n` : ''}
</div>

> 🎮 **How to play:** pick any move below. It opens a pre-filled GitHub issue, just press **Submit new issue** and the bot plays it within a minute. **Everyone gets exactly one move per game**, and your username is recorded in the move log.

| Piece | Legal moves |
| :-- | :-- |
${rows}

${n ? `**📜 Latest moves**\n\n| # | Move | Played by |\n| :-: | :-: | :-- |\n${log}` : '_No moves yet — be the first to play!_'}`;
}

function render(c) {
  save(STATE, state);
  save(HISTORY, history);
  fs.writeFileSync('chess/board.svg', boardSvg(c));
  const md = fs.readFileSync('README.md', 'utf8');
  const re = /<!--CHESS-START-->[\s\S]*<!--CHESS-END-->/;
  fs.writeFileSync('README.md', md.replace(re, () => `<!--CHESS-START-->\n${section(c)}\n<!--CHESS-END-->`));
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
