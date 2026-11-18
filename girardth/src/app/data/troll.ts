import type { EquipmentSlot } from './equipment';

export type TrollStat =
  | 'attackPhysical'
  | 'attackMagic'
  | 'defensePhysical'
  | 'defenseMagic'
  | 'dodge'
  | 'health';

export type TrollStats = Record<TrollStat, number>;
export type WeaponId = 'fists';

export interface TrollMarket {
  date: string;
  itemIds: string[];
  upgrades: number;
  rerolls: number;
}

export interface Troll {
  id: number;
  name: string;
  className: 'Guerrier';
  level: number;
  xp: number;
  gold: number;
  currentHealth?: number;
  stats: TrollStats;
  weapon: WeaponId;
  inventory: string[];
  equipment: Partial<Record<EquipmentSlot, string>>;
  market?: TrollMarket;
  active: boolean;
}

export const STAT_LABELS: Record<TrollStat, string> = {
  attackPhysical: 'Attaque physique',
  attackMagic: 'Attaque magique',
  defensePhysical: 'Défense physique',
  defenseMagic: 'Défense magique',
  dodge: 'Esquive',
  health: 'Vie',
};

export const STARTING_STATS: TrollStats = {
  attackPhysical: 10,
  attackMagic: 5,
  defensePhysical: 8,
  defenseMagic: 5,
  dodge: 5,
  health: 7,
};

export function maxHealth(troll: Troll, healthBonus = 0): number {
  return troll.stats.health * 5 + healthBonus + (troll.level - 1) * 5;
}

/** Calcule le bonus automatique de niveau pour une caractéristique. */
export function levelStatBonus(troll: Troll, stat: TrollStat): number {
  return stat === 'health' ? 0 : Math.max(0, troll.level - 1);
}

export function xpForNextLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

export function maxStatPoints(level: number): number {
  return 40 + 2 * Math.max(0, level - 1);
}

export function totalStatPoints(stats: TrollStats): number {
  return Object.values(stats).reduce((sum, value) => sum + value, 0);
}
