import type { PanelDef } from './frame';
import { inventoryPanel } from './inventory';
import { skillsPanel } from './skills';
import { researchPanel } from './research';
import { craftPanel } from './craft';
import { buildingPanel, productionPanel, blueprintsPanel } from './factory';
import { npcPanel, questsPanel } from './npc';
import { mapPanel } from './map';
import { pausePanel, savesPanel, settingsPanel, helpPanel, victoryPanel } from './menus';

export const PANELS: Record<string, PanelDef> = {
  inventory: inventoryPanel, skills: skillsPanel, research: researchPanel, craft: craftPanel, building: buildingPanel,
  production: productionPanel, blueprints: blueprintsPanel, npc: npcPanel, quests: questsPanel, map: mapPanel,
  pause: pausePanel, saves: savesPanel, settings: settingsPanel, help: helpPanel, victory: victoryPanel,
};
