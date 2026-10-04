import { h, tip } from '../dom';
import type { UI } from '../ui';
import { panelFrame, type PanelDef } from './frame';
import { SKILLS, PASSIVES, SKILL_MAP } from '../../data/skills';
import { skillIcon } from '../../render/icons';

export const skillsPanel: PanelDef = {
  live: true,
  sig: (ui) => { const p = ui.game!.player; return `${p.skillPoints}|${p.passivePoints}|${[...p.skills.values()].map((s) => s.rank + [...s.mods].join()).join()}|${[...p.passives].join()}|${p.bar.join()}|${ui.panelState.skills.assign ?? ''}`; },
  render(ui) {
    const g = ui.game!;
    const pl = g.player;
    const st = ui.panelState.skills;
    const assign = st.assign as string | undefined;
    const skillCol = h('div', { style: { width: '520px' } },
      h('div', { class: 'row' }, h('h3', { class: 'title' }, 'Active Skills'), h('div', { class: 'grow' }), h('span', { class: pl.skillPoints ? 'gold' : 'dim' }, `${pl.skillPoints} skill point${pl.skillPoints === 1 ? '' : 's'}`)),
      ...SKILLS.map((d) => {
        const s = pl.skills.get(d.id)!;
        const can = pl.canLearnSkill(d.id);
        const mods = h('div', { class: 'mods' }, ...d.mods.map((m) => {
          const taken = s.mods.has(m.id);
          const avail = !taken && pl.skillPoints > 0 && s.rank >= m.reqRank;
          const el = h('div', { class: `mod ${taken ? 'taken' : avail ? 'avail' : 'locked'}`, onclick: () => { if (avail && pl.learnMod(d.id, m.id)) { ui.audio.play('levelup'); ui.refreshPanel(); } } }, `${taken ? '◆' : '◇'} ${m.name}`);
          return tip(el, () => `<b class="gold">${m.name}</b><div>${m.desc}</div><div class="dim">Requires rank ${m.reqRank}</div>`);
        }));
        return h('div', { class: 'skillrow' },
          h('img', { src: skillIcon(d.id, 52), style: { opacity: s.rank ? '1' : '0.35', cursor: s.rank ? 'pointer' : 'default', outline: assign === d.id ? '2px solid #ffe2a0' : '' }, onclick: () => { if (s.rank) { st.assign = assign === d.id ? undefined : d.id; ui.refreshPanel(); } } }),
          h('div', null, h('div', null, h('b', { class: 'gold' }, d.name), h('span', { class: 'dim' }, `  rank ${s.rank}/${d.maxRank}${pl.stats.allSkills && s.rank ? ` (+${pl.stats.allSkills})` : ''} · ${d.kind}${d.reqLevel > 1 ? ` · req. level ${d.reqLevel}` : ''}`)),
            h('div', { style: { fontSize: '0.88em', marginTop: '2px' } }, d.desc),
            h('div', { class: 'dim', style: { fontSize: '0.82em' } }, [d.weaponPct ? `${d.weaponPct + d.perRank * Math.max(0, s.rank - 1)}% weapon damage` : '', d.cooldown ? `${d.cooldown}s cooldown` : '', d.cost ? `${d.cost} Resolve` : '', d.gain ? `+${d.gain} Resolve` : ''].filter(Boolean).join(' · ')),
            mods),
          h('button', { class: 'btn small', disabled: !can, onclick: () => { pl.learnSkill(d.id); ui.renderSkillBar(); ui.refreshPanel(); } }, s.rank ? 'Rank +' : 'Learn'),
        );
      }),
      h('h3', { class: 'title' }, 'Action Bar'),
      h('div', { class: 'dim', style: { fontSize: '0.85em' } }, assign ? `Click a slot to bind ${SKILL_MAP.get(assign)!.name}` : 'Click a learned skill icon above, then click a slot.'),
      h('div', { class: 'row' }, ...pl.bar.map((sk, i) => h('div', { class: 'slot', style: { cursor: 'pointer' }, onclick: () => {
        if (!assign) return;
        const prev = pl.bar.indexOf(assign);
        if (prev >= 0) pl.bar[prev] = pl.bar[i];
        pl.bar[i] = assign;
        st.assign = undefined;
        ui.renderSkillBar(); ui.refreshPanel();
      } }, sk ? h('img', { src: skillIcon(sk, 54) }) : null, h('div', { class: 'key' }, ['LMB', 'RMB', '1', '2', '3', '4'][i])))),
    );
    // passive tree
    const W = 740, X = (x: number) => 64 + x * 118, Y = (y: number) => 10 + y * 64;
    const tree = h('div', { class: 'ptree', style: { width: `${W}px` } });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'plinks'); svg.setAttribute('width', String(W)); svg.setAttribute('height', '330');
    for (const p of PASSIVES) for (const r of p.prereq) {
      const q = PASSIVES.find((x) => x.id === r)!;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(X(q.x))); line.setAttribute('y1', String(Y(q.y) + 20));
      line.setAttribute('x2', String(X(p.x))); line.setAttribute('y2', String(Y(p.y) + 10));
      line.setAttribute('stroke', pl.passives.has(p.id) && pl.passives.has(r) ? '#d6b26a' : '#3a3029'); line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
    }
    tree.appendChild(svg);
    for (const p of PASSIVES) {
      const taken = pl.passives.has(p.id);
      const avail = !taken && pl.canTakePassive(p.id);
      const n = h('div', { class: `pnode ${taken ? 'taken' : avail ? 'avail' : 'locked'} ${p.keystone ? 'key' : ''}`, style: { left: `${X(p.x)}px`, top: `${Y(p.y)}px` }, onclick: () => { if (pl.takePassive(p.id)) { ui.audio.play('levelup'); ui.refreshPanel(); } } }, p.name);
      tip(n, () => `<b class="gold">${p.name}</b><div>${p.desc}</div>${p.keystone ? '<div class="warn">Keystone</div>' : ''}`);
      tree.appendChild(n);
    }
    const passCol = h('div', null,
      h('div', { class: 'row' }, h('h3', { class: 'title' }, 'Passive Constellation'), h('div', { class: 'grow' }), h('span', { class: pl.passivePoints ? 'gold' : 'dim' }, `${pl.passivePoints} passive point${pl.passivePoints === 1 ? '' : 's'}`)),
      h('div', { class: 'dim', style: { fontSize: '0.85em' } }, 'Warpath (offense) · Bastion (defense) · Foundry (industry). Points come every second level.'),
      tree,
      h('button', { class: 'btn small danger', onclick: () => { const cost = 50 * pl.level; if (pl.embers < cost) { ui.toast(`Respec costs ${cost} embers`, 'warn'); return; } pl.embers -= cost; pl.respec(); ui.renderSkillBar(); ui.refreshPanel(); } }, `Reset skills & passives (${50 * pl.level} embers)`),
    );
    return panelFrame(ui, 'Skills & Passives', h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '18px' } }, skillCol, passCol), { width: 1340 });
  },
};
