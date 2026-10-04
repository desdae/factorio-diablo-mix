import { h } from '../dom';
import type { UI } from '../ui';
import { panelFrame, type PanelDef } from './frame';

/** Scalable world map: pan with drag, zoom with wheel, right-click to add a marker. */
export const mapPanel: PanelDef = {
  render(ui) {
    const g = ui.game!;
    const st = ui.panelState.map;
    const lvl = g.playerLevel();
    const m = lvl.map;
    const W = Math.min(1100, window.innerWidth - 80), H = Math.min(720, window.innerHeight - 160);
    const cv = h('canvas', { id: 'bigmap', width: W, height: H }) as HTMLCanvasElement;
    st.zoom ??= 3; st.cx ??= g.player.x; st.cy ??= g.player.y;
    // base terrain image (1px per tile)
    const base = document.createElement('canvas');
    base.width = m.w; base.height = m.h;
    const bctx = base.getContext('2d')!;
    const img = bctx.createImageData(m.w, m.h);
    for (let i = 0; i < m.w * m.h; i++) {
      if (!m.explored[i]) continue;
      const c = ui.tileColor(m, i);
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
    let drag: { x: number; y: number } | null = null;
    const draw = () => {
      if (!cv.isConnected) return;
      const ctx = cv.getContext('2d')!;
      const z = st.zoom as number;
      const ox = W / 2 - (st.cx as number) * z, oy = H / 2 - (st.cy as number) * z;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, ox, oy, m.w * z, m.h * z);
      const P = (x: number, y: number) => [ox + x * z, oy + y * z];
      ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center';
      for (const p of m.pois) {
        if (!p.discovered && p.kind !== 'dungeon' && p.kind !== 'hive' && p.kind !== 'settlement') continue;
        const [x, y] = P(p.x + 0.5, p.y + 0.5);
        const col = { dungeon: '#ff8a3a', hive: '#c8ff5a', nest: '#c060ff', camp: '#d04040', ruin: '#d6b26a', settlement: '#7ae0c0', exit: '#7ad7ff', boss_arena: '#ff3a1a', treasure: '#ffd27a', shrine: '#ffd27a', spawn: '#fff' }[p.kind] ?? '#fff';
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, p.kind === 'camp' ? 3 : 5, 0, Math.PI * 2); ctx.fill();
        if (p.kind !== 'camp' || z > 4) { ctx.fillStyle = '#000'; ctx.fillText(p.name + (p.cleared ? ' ✓' : ''), x + 1, y - 8); ctx.fillStyle = col; ctx.fillText(p.name + (p.cleared ? ' ✓' : ''), x, y - 9); }
      }
      if (lvl.map.kind === 'overworld') {
        // rail-like logistics overview: belts drawn, power networks outlined
        for (const n of g.power.nets) { ctx.strokeStyle = 'rgba(255,210,122,0.35)'; for (const p of n.pylons) { const [x, y] = P(p.x - 3, p.y - 3); ctx.strokeRect(x, y, 7 * z, 7 * z); } }
      }
      for (const e of lvl.enemies) { if (e.dead || !m.explored[m.idx(Math.floor(e.x), Math.floor(e.y))]) continue; const [x, y] = P(e.x, e.y); ctx.fillStyle = e.def.boss ? '#ff3a1a' : e.wave ? '#ff7a3a' : '#a02a2a'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
      for (const mk of g.markers) { const [x, y] = P(mk.x, mk.y); ctx.fillStyle = '#7ad7ff'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y - 10); ctx.lineTo(x + 5, y - 10); ctx.fill(); ctx.fillText(mk.label, x, y - 14); }
      if (g.waveOrigin && g.time - g.waveOrigin.t < 120) { const [x, y] = P(g.waveOrigin.x, g.waveOrigin.y); ctx.strokeStyle = '#ff3a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10 + Math.sin(performance.now() / 200) * 3, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
      const [px, py] = P(g.player.x, g.player.y);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
      requestAnimationFrame(draw);
    };
    cv.addEventListener('wheel', (e) => { e.preventDefault(); st.zoom = Math.max(1, Math.min(24, (st.zoom as number) * (e.deltaY > 0 ? 0.85 : 1.18))); }, { passive: false });
    cv.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        const r = cv.getBoundingClientRect(); const z = st.zoom as number;
        const wx = (st.cx as number) + (e.clientX - r.left - W / 2) / z, wy = (st.cy as number) + (e.clientY - r.top - H / 2) / z;
        const near = g.markers.findIndex((mk) => Math.hypot(mk.x - wx, mk.y - wy) < 6 / z + 1);
        if (near >= 0) g.markers.splice(near, 1); else g.markers.push({ x: wx, y: wy, label: `Marker ${g.markers.length + 1}` });
        return;
      }
      drag = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => { if (!drag) return; const z = st.zoom as number; st.cx = (st.cx as number) - (e.clientX - drag.x) / z; st.cy = (st.cy as number) - (e.clientY - drag.y) / z; drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', () => { drag = null; });
    requestAnimationFrame(draw);
    return panelFrame(ui, lvl.map.kind === 'dungeon' ? `The Sunken Foundry — Depth ${g.dungeonDepth}` : 'World Map', [cv, h('div', { class: 'faint', style: { fontSize: '0.85em', marginTop: '4px' } }, `Seed ${g.seedText} · drag to pan · wheel to zoom · right-click to add/remove a marker`)], {
      actions: [h('button', { class: 'btn small', onclick: () => { st.cx = g.player.x; st.cy = g.player.y; } }, 'Center')],
    });
  },
};
