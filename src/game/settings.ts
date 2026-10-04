export interface Difficulty {
  id: string;
  name: string;
  playerDmg: number;
  enemyDmg: number;
  enemyHp: number;
  waveFreq: number;
  threat: number;
  resourceRich: number;
  deathPenalty: 'none' | 'mild' | 'harsh';
  research: number; // research cost multiplier
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'story', name: 'Wayfarer (Story)', playerDmg: 1.5, enemyDmg: 0.5, enemyHp: 0.7, waveFreq: 0.5, threat: 0.5, resourceRich: 2, deathPenalty: 'none', research: 0.75 },
  { id: 'standard', name: 'Kindled (Standard)', playerDmg: 1, enemyDmg: 1, enemyHp: 1, waveFreq: 1, threat: 1, resourceRich: 1, deathPenalty: 'mild', research: 1 },
  { id: 'veteran', name: 'Ashwalker (Veteran)', playerDmg: 0.9, enemyDmg: 1.4, enemyHp: 1.35, waveFreq: 1.4, threat: 1.3, resourceRich: 0.8, deathPenalty: 'mild', research: 1.25 },
  { id: 'torment', name: 'Cinderborn (Torment)', playerDmg: 0.8, enemyDmg: 2, enemyHp: 1.8, waveFreq: 2, threat: 1.6, resourceRich: 0.6, deathPenalty: 'harsh', research: 1.5 },
];

export interface WorldMods { scarce: boolean; aggressive: boolean; endless: boolean; costly: boolean }

export interface Settings {
  master: number; music: number; sfx: number;
  screenShake: number; // 0..1
  damageNumbers: 'all' | 'crits' | 'off';
  reduceFlashing: boolean;
  colorblind: 'off' | 'deutan' | 'protan' | 'tritan';
  uiScale: number;
  particles: number; // 0..1 density
  renderScale: number;
  fpsLimit: 0 | 30 | 60 | 120;
  lighting: boolean;
  weatherFx: boolean;
  showFps: boolean;
  holdToGather: boolean; // false = toggle
  subtitles: boolean;
  lootFilter: { minRarity: number; autoSalvage: boolean };
  keys: Record<string, string>;
  dayLength: number; // seconds
}

export const DEFAULT_KEYS: Record<string, string> = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  skill3: 'Digit1', skill4: 'Digit2', skill5: 'Digit3', skill6: 'Digit4',
  dodge: 'Space', interact: 'KeyF', tonic: 'KeyQ', charge: 'KeyG',
  build: 'KeyB', rotate: 'KeyR', inventory: 'KeyI', character: 'KeyC', skills: 'KeyK', research: 'KeyT',
  production: 'KeyP', map: 'KeyM', quests: 'KeyJ', blueprint: 'KeyV', deconstruct: 'KeyX', craft: 'KeyH', pipette: 'KeyE',
};

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, music: 0.5, sfx: 0.8, screenShake: 1, damageNumbers: 'all', reduceFlashing: false, colorblind: 'off', uiScale: 1,
  particles: 1, renderScale: 1, fpsLimit: 0, lighting: true, weatherFx: true, showFps: false, holdToGather: true, subtitles: true,
  lootFilter: { minRarity: 0, autoSalvage: false }, keys: { ...DEFAULT_KEYS }, dayLength: 480,
};

export function loadSettings(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('emberforge.settings') : null;
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys ?? {}) }, lootFilter: { ...DEFAULT_SETTINGS.lootFilter, ...(s.lootFilter ?? {}) } };
    }
  } catch { /* corrupted settings fall back to defaults */ }
  return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS }, lootFilter: { ...DEFAULT_SETTINGS.lootFilter } };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem('emberforge.settings', JSON.stringify(s)); } catch { /* storage unavailable */ }
}
