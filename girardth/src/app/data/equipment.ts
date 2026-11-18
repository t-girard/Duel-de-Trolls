import { levelStatBonus } from './troll';
import { STAT_LABELS } from './troll';
import type { Troll, TrollStat, TrollStats } from './troll';

export type EquipmentSlot =
  | 'weapon'
  | 'helmet'
  | 'chest'
  | 'legs'
  | 'boots'
  | 'gloves'
  | 'shield'
  | 'consumable1'
  | 'consumable2';

export interface EquipmentItem {
  id: string;
  name: string;
  category: 'arme' | 'armure' | 'potion';
  type: string;
  classes: string[];
  slot: EquipmentSlot | null;
  attackType: 'attackPhysical' | 'attackMagic' | null;
  stats: Partial<TrollStats>;
  description: string;
  price: number;
  requiredLevel: number;
}

const physical = (attackPhysical = 0, defensePhysical = 0, dodge = 0, health = 0): Partial<TrollStats> => ({
  attackPhysical,
  defensePhysical,
  dodge,
  health,
});

export const EQUIPMENT: EquipmentItem[] = [
  { id: 'gourdasse-bois', name: 'Gourdasse en bois brut', category: 'arme', type: 'massue', classes: ['Guerrier'], slot: 'weapon', attackType: 'attackPhysical', stats: physical(3), description: 'Une grosse branche solide taillée grossièrement.', price: 250, requiredLevel: 1 },
  { id: 'epee-rouillee', name: 'Épée rouillée de maraudeur', category: 'arme', type: 'épée', classes: ['Guerrier'], slot: 'weapon', attackType: 'attackPhysical', stats: physical(5), description: 'Une vieille lame ramassée sur le champ de bataille.', price: 450, requiredLevel: 1 },
  { id: 'hache-fendeur', name: 'Hache de fendeur de crânes', category: 'arme', type: 'hache', classes: ['Guerrier'], slot: 'weapon', attackType: 'attackPhysical', stats: physical(8, 0, -1), description: 'Lourde et tranchante, frappe fort au détriment de l’agilité.', price: 800, requiredLevel: 2 },
  { id: 'espadon-pierre', name: 'Espadon en pierre taillée', category: 'arme', type: 'épée', classes: ['Guerrier'], slot: 'weapon', attackType: 'attackPhysical', stats: physical(12, 1, -2), description: 'Un bloc de roche effilé réservé aux plus imposants des trolls.', price: 1250, requiredLevel: 4 },
  { id: 'calotte-fer', name: 'Calotte de fer brut', category: 'armure', type: 'casque', classes: ['Guerrier'], slot: 'helmet', attackType: null, stats: physical(0, 2), description: 'Protège le haut de la tête contre les cailloux.', price: 300, requiredLevel: 1 },
  { id: 'casque-cornes', name: 'Casque à cornes de guerre', category: 'armure', type: 'casque', classes: ['Guerrier'], slot: 'helmet', attackType: null, stats: physical(0, 4, 0, 5), description: 'Épais et robuste, il renforce la résistance générale du troll.', price: 650, requiredLevel: 2 },
  { id: 'plastron-cuir', name: 'Plastron de cuir clouté', category: 'armure', type: 'plastron', classes: ['Guerrier'], slot: 'chest', attackType: null, stats: physical(0, 4, 0, 8), description: 'Cuir épais pour encaisser les coups sans trop faiblir.', price: 700, requiredLevel: 2 },
  { id: 'plastron-fer', name: 'Plastron en plaques de fer', category: 'armure', type: 'plastron', classes: ['Guerrier'], slot: 'chest', attackType: null, stats: physical(0, 7, -2, 15), description: 'Lourd blindage d’acier brut augmentant grandement la santé.', price: 1100, requiredLevel: 4 },
  { id: 'jambieres-cuir', name: 'Jambières de cuir durci', category: 'armure', type: 'jambières', classes: ['Guerrier'], slot: 'legs', attackType: null, stats: physical(0, 3), description: 'Bonne protection des cuisses et genoux.', price: 450, requiredLevel: 1 },
  { id: 'bottes-fer', name: 'Bottes ferrées de fantassin', category: 'armure', type: 'bottes', classes: ['Guerrier'], slot: 'boots', attackType: null, stats: physical(0, 2, -1), description: 'Lourdes bottes assurant une bonne stabilité.', price: 400, requiredLevel: 1 },
  { id: 'gantelets-fer', name: 'Gantelets en fer forgé', category: 'armure', type: 'gants', classes: ['Guerrier'], slot: 'gloves', attackType: null, stats: physical(1, 2), description: 'Protège les mains et durcit l’impact des coups.', price: 450, requiredLevel: 1 },
  { id: 'bouclier-bois-metal', name: 'Bouclier en bois et métal', category: 'armure', type: 'bouclier', classes: ['Guerrier'], slot: 'shield', attackType: null, stats: physical(0, 5, -1), description: 'Grand pavois pour bloquer les frappes de face.', price: 800, requiredLevel: 3 },
  { id: 'potion-force', name: 'Potion de force brute', category: 'potion', type: 'potion', classes: ['Guerrier'], slot: null, attackType: null, stats: physical(4), description: 'Décuple temporairement la force d’impact du guerrier.', price: 350, requiredLevel: 1 },
  { id: 'potion-carapace', name: 'Potion de carapace de pierre', category: 'potion', type: 'potion', classes: ['toutes'], slot: null, attackType: null, stats: physical(0, 4, -1), description: 'Durcit la peau du troll contre les armes physiques.', price: 350, requiredLevel: 1 },
  { id: 'infusion-vigueur', name: 'Infusion de vigueur troll', category: 'potion', type: 'potion', classes: ['toutes'], slot: null, attackType: null, stats: { health: 15 }, description: 'Augmente temporairement les points de vie max du personnage.', price: 450, requiredLevel: 1 },
];

export const EQUIPMENT_SLOTS: { id: EquipmentSlot; label: string }[] = [
  { id: 'weapon', label: 'Arme' },
  { id: 'helmet', label: 'Casque' },
  { id: 'chest', label: 'Plastron' },
  { id: 'legs', label: 'Jambières' },
  { id: 'boots', label: 'Bottes' },
  { id: 'gloves', label: 'Gants' },
  { id: 'shield', label: 'Bouclier' },
  { id: 'consumable1', label: 'Consommable 1' },
  { id: 'consumable2', label: 'Consommable 2' },
];

export function equipmentItem(id: string | undefined, catalog: EquipmentItem[] = EQUIPMENT): EquipmentItem | undefined {
  return catalog.find((item) => item.id === id);
}

export function attackTypeLabel(item: EquipmentItem | undefined): 'Attaque physique' | 'Attaque magique' | 'Aucun' {
  if (!item) return 'Attaque physique';
  if (item.attackType === 'attackMagic') return 'Attaque magique';
  if (item.attackType === 'attackPhysical') return 'Attaque physique';
  return 'Aucun';
}

export function equipmentBonus(troll: Troll, stat: TrollStat, catalog: EquipmentItem[] = EQUIPMENT): number {
  const equippedItems = Object.entries(troll.equipment ?? {})
    .filter(([slot]) => slot !== 'consumable1' && slot !== 'consumable2')
    .map(([, id]) => id)
    .map((id) => equipmentItem(id, catalog))
    .filter((item): item is EquipmentItem => !!item);
  const itemBonus = equippedItems.reduce((sum, item) => sum + (item.stats[stat] ?? 0), 0);
  const fistsBonus = !troll.equipment?.weapon && stat === 'attackPhysical' ? 1 : 0;
  return itemBonus + fistsBonus;
}

export function effectiveStat(troll: Troll, stat: TrollStat, catalog: EquipmentItem[] = EQUIPMENT): number {
  return Math.max(1, troll.stats[stat] + levelStatBonus(troll, stat) + equipmentBonus(troll, stat, catalog));
}

export function canUseEquipment(troll: Troll, item: EquipmentItem): boolean {
  return item.requiredLevel <= troll.level &&
    item.classes.some((className) => className.toLowerCase() === 'toutes' || className.toLowerCase() === troll.className.toLowerCase());
}

export function formatItemStats(item: EquipmentItem): string {
  return Object.entries(item.stats)
    .filter(([, value]) => value)
    .map(([stat, value]) => `${value! > 0 ? '+' : ''}${value} ${({
      attackPhysical: 'ATQ PHY',
      attackMagic: 'ATQ MAG',
      defensePhysical: 'DÉF PHY',
      defenseMagic: 'DÉF MAG',
      dodge: 'ESQ',
      health: 'VIE',
    } as Record<TrollStat, string>)[stat as TrollStat]}`)
    .join(' · ');
}

export function itemStatEntries(item: EquipmentItem): { stat: TrollStat; label: string; value: number }[] {
  return Object.entries(item.stats)
    .filter((entry): entry is [TrollStat, number] => typeof entry[1] === 'number' && entry[1] !== 0)
    .map(([stat, value]) => ({ stat, label: STAT_LABELS[stat], value }));
}
