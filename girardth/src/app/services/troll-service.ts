import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import {
  STARTING_STATS,
  maxHealth,
  Troll,
  TrollMarket,
  TrollStat,
  TrollStats,
  maxStatPoints,
  totalStatPoints,
  xpForNextLevel,
} from '../data/troll';
import { canUseEquipment, equipmentBonus, EquipmentItem, equipmentItem } from '../data/equipment';
import type { EquipmentSlot } from '../data/equipment';
import { FirebaseCatalogService } from './firebase-catalog-service';
import { FirebasePlayerDataService } from './firebase-player-data-service';

const STORAGE_KEY = 'duel-de-trolls';
const LEGACY_MARKET_UPGRADE_KEY = 'duel-de-trolls-market-upgrades';
const BASE_MARKET_STOCK = 5;
const BASE_MARKET_UPGRADE_PRICE = 500;
const BASE_MARKET_REROLL_PRICE = 100;
const MARKET_REROLL_PRICE_INCREMENT = 50;

/** Produit une clé de date locale stable au format AAAA-MM-JJ. */
function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Charge et valide le nombre d’améliorations déjà achetées. */
function loadLegacyMarketUpgrades(): number {
  if (typeof localStorage === 'undefined') return 0;
  const value = Number(localStorage.getItem(LEGACY_MARKET_UPGRADE_KEY) ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Décale la rotation du catalogue à chaque jour calendaire. */
function dailyStartIndex(day: string, candidateCount: number, trollId: number, rerolls = 0): number {
  const [year, month, date] = day.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, date) / 86_400_000);
  return (dayNumber + trollId - 1 + rerolls) % candidateCount;
}

/** Construit le personnage initial quand aucune sauvegarde n’existe. */
function initialTrolls(): Troll[] {
  return [
    {
      id: 1,
      name: 'Gorgrim',
      className: 'Guerrier',
      level: 1,
      xp: 0,
      gold: 50,
      currentHealth: STARTING_STATS.health * 5,
      stats: { ...STARTING_STATS },
      weapon: 'fists',
      inventory: [],
      equipment: {},
      active: true,
    },
  ];
}

/** Charge les trolls sauvegardés et complète les données historiques. */
function loadTrolls(): Troll[] {
  if (typeof localStorage === 'undefined') return initialTrolls();
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return initialTrolls();

  try {
    const trolls = JSON.parse(saved) as Troll[];
    if (Array.isArray(trolls) && trolls.length > 0) {
      return trolls.map((troll) => {
        const normalized = {
          ...troll,
          weapon: 'fists' as const,
          inventory: Array.isArray(troll.inventory) ? troll.inventory : [],
          equipment: troll.equipment ?? {},
        };
        const maximumHealth = maxHealth(normalized, equipmentBonus(normalized, 'health'));
        return {
          ...normalized,
          currentHealth: Number.isFinite(troll.currentHealth)
            ? Math.max(0, Math.min(maximumHealth, troll.currentHealth!))
            : maximumHealth,
        };
      });
    }
  } catch (error) {
    console.error('Impossible de charger les trolls sauvegardés.', error);
  }
  return initialTrolls();
}

@Injectable({ providedIn: 'root' })
export class TrollService {
  private readonly catalog = inject(FirebaseCatalogService);
  private readonly playerData = inject(FirebasePlayerDataService);
  readonly trolls = signal<Troll[]>(loadTrolls());
  readonly activeTroll = computed(() => this.trolls().find((troll) => troll.active) ?? null);
  readonly marketDate = signal(localDateKey());
  /** Expose la sélection quotidienne correspondant au personnage actif. */
  readonly dailyMarketEquipment = computed(() => {
    const troll = this.activeTroll();
    return troll ? this.dailyMarketEquipmentFor(troll.id) : [];
  });
  readonly alchemistEquipment = computed(() => {
    const troll = this.activeTroll();
    return troll
      ? this.catalog.equipment().filter((item) =>
        item.category === 'potion' && canUseEquipment(troll, item),
      )
      : [];
  });
  private readonly destroyRef = inject(DestroyRef);
  private marketRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private healthRegenerationTimer: ReturnType<typeof setInterval> | undefined;
  private readonly combatTrollIds = new Set<number>();

  constructor() {
    const today = localDateKey();
    const legacyUpgrades = loadLegacyMarketUpgrades();
    let migrationNeeded = false;
    this.trolls.update((trolls) => trolls.map((troll) => {
      const savedUpgrades = troll.market?.upgrades;
      const upgrades = Number.isSafeInteger(savedUpgrades) && savedUpgrades! >= 0
        ? savedUpgrades!
        : troll.active ? legacyUpgrades : 0;
      const savedRerolls = troll.market?.rerolls;
      const rerolls = Number.isSafeInteger(savedRerolls) && savedRerolls! >= 0
        ? savedRerolls!
        : 0;
      if (troll.market?.date === today && Array.isArray(troll.market.itemIds) && troll.market.itemIds.length > 0) {
        if (troll.market.upgrades !== upgrades || troll.market.rerolls !== rerolls) migrationNeeded = true;
        return { ...troll, market: { ...troll.market, upgrades, rerolls } };
      }
      migrationNeeded = true;
      return { ...troll, market: this.createDailyMarket(troll, today, upgrades, 0) };
    }));
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_MARKET_UPGRADE_KEY);
    if (migrationNeeded) this.persist();
    this.playerData.start((remoteTrolls, initial) => {
      if (remoteTrolls === null) {
        if (initial) {
          this.persist();
        } else {
          this.trolls.set([]);
          this.persistLocal();
        }
        return;
      }

      const today = localDateKey();
      this.marketDate.set(today);
      this.trolls.set(remoteTrolls.map((troll) => {
        const market = troll.market;
        const remoteTroll = {
          ...troll,
          currentHealth: this.currentHealth(troll),
        };
        if (market?.date === today && Array.isArray(market.itemIds)) return remoteTroll;
        return {
          ...remoteTroll,
          market: this.createDailyMarket(remoteTroll, today, market?.upgrades ?? 0, 0),
        };
      }));
      this.persistLocal();
    });
    effect(() => {
      const catalogLoaded = this.catalog.equipmentLoaded();
      const equipment = this.catalog.equipment();
      if (!this.catalog.firebaseEnabled || !catalogLoaded) return;
      this.trolls.update((trolls) => trolls.map((troll) => {
        const market = troll.market;
        if (!market || market.date !== this.marketDate()) return troll;
        return {
          ...troll,
          market: this.createDailyMarket(troll, market.date, market.upgrades, market.rerolls, equipment),
        };
      }));
      this.persist();
    });
    this.scheduleMarketRefresh();
    this.healthRegenerationTimer = setInterval(() => this.regenerateHealth(), 5000);
    this.destroyRef.onDestroy(() => {
      if (this.healthRegenerationTimer !== undefined) clearInterval(this.healthRegenerationTimer);
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.onWindowFocus);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('focus', this.onWindowFocus);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        if (this.marketRefreshTimer !== undefined) clearTimeout(this.marketRefreshTimer);
      });
    }
  }

  /** Retourne le libellé français de la date de la sélection du marché. */
  get marketDayLabel(): string {
    const [year, month, day] = this.marketDate().split('-').map(Number);
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      .format(new Date(year, month - 1, day));
  }

  /** Renouvelle le stock de tous les personnages quand la date locale change. */
  readonly refreshMarketDay = (date = new Date()): void => {
    const today = localDateKey(date);
    if (this.marketDate() === today) return;
    this.marketDate.set(today);
    this.trolls.update((trolls) => trolls.map((troll) => ({
      ...troll,
      market: this.createDailyMarket(troll, today, troll.market?.upgrades ?? 0, 0),
    })));
    this.persist();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.refreshMarketDay();
  };

  private readonly onWindowFocus = (): void => {
    this.refreshMarketDay();
  };

  /** Programme la vérification à minuit dans le fuseau horaire local. */
  private scheduleMarketRefresh(): void {
    if (this.marketRefreshTimer !== undefined) clearTimeout(this.marketRefreshTimer);
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    this.marketRefreshTimer = setTimeout(() => {
      this.refreshMarketDay();
      this.scheduleMarketRefresh();
    }, Math.max(1, nextMidnight.getTime() - Date.now()));
  }

  /** Enregistre la liste des trolls dans le stockage local. */
  private persist(): void {
    this.persistLocal();
    this.playerData.save(this.trolls());
  }

  private persistLocal(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.trolls()));
    }
  }

  currentHealth(troll: Troll): number {
    const maximum = maxHealth(troll, equipmentBonus(troll, 'health', this.catalog.equipment()));
    return Math.max(0, Math.min(maximum, troll.currentHealth ?? maximum));
  }

  setCurrentHealth(trollId: number, health: number): void {
    this.trolls.update((trolls) => trolls.map((troll) => {
      if (troll.id !== trollId) return troll;
      const maximum = maxHealth(troll, equipmentBonus(troll, 'health', this.catalog.equipment()));
      return { ...troll, currentHealth: Math.max(0, Math.min(maximum, health)) };
    }));
    this.persist();
  }

  beginCombat(trollId: number): void {
    this.combatTrollIds.add(trollId);
  }

  endCombat(trollId: number): void {
    this.combatTrollIds.delete(trollId);
  }

  private regenerateHealth(): void {
    let healed = false;
    this.trolls.update((trolls) => trolls.map((troll) => {
      if (this.combatTrollIds.has(troll.id)) return troll;
      const current = this.currentHealth(troll);
      const maximum = maxHealth(troll, equipmentBonus(troll, 'health', this.catalog.equipment()));
      if (current >= maximum) return troll;
      healed = true;
      return { ...troll, currentHealth: Math.min(maximum, current + 1) };
    }));
    if (healed) this.persist();
  }

  /** Construit l’étal journalier propre au personnage. */
  private createDailyMarket(
    troll: Troll,
    day: string,
    upgrades: number,
    rerolls: number,
    catalog: EquipmentItem[] = this.catalog.equipment(),
  ): TrollMarket {
    const candidates = catalog.filter((item) => item.category !== 'potion' && canUseEquipment(troll, item))
      .sort((first, second) => first.id.localeCompare(second.id));
    const count = Math.min(BASE_MARKET_STOCK + upgrades, candidates.length);
    const start = candidates.length ? dailyStartIndex(day, candidates.length, troll.id, rerolls) : 0;
    return {
      date: day,
      upgrades,
      rerolls,
      itemIds: Array.from({ length: count }, (_, index) =>
        candidates[(start + index) % candidates.length].id,
      ),
    };
  }

  /** Retourne les articles de l’étal journalier d’un personnage. */
  dailyMarketEquipmentFor(trollId: number): EquipmentItem[] {
    const troll = this.trolls().find((entry) => entry.id === trollId);
    return (troll?.market?.itemIds ?? [])
      .map((id) => equipmentItem(id, this.catalog.equipment()))
      .filter((item): item is EquipmentItem => !!item);
  }

  marketStockCapacity(trollId: number): number {
    const upgrades = this.trolls().find((troll) => troll.id === trollId)?.market?.upgrades ?? 0;
    return BASE_MARKET_STOCK + upgrades;
  }

  marketUpgradePrice(trollId: number): number {
    const upgrades = this.trolls().find((troll) => troll.id === trollId)?.market?.upgrades ?? 0;
    return BASE_MARKET_UPGRADE_PRICE * (upgrades + 1);
  }

  marketRerollPrice(trollId: number): number {
    const rerolls = this.trolls().find((troll) => troll.id === trollId)?.market?.rerolls ?? 0;
    return BASE_MARKET_REROLL_PRICE + MARKET_REROLL_PRICE_INCREMENT * rerolls;
  }

  /** Renouvelle l’étal d’un personnage contre de l’or. */
  rerollMarket(trollId: number): boolean {
    const troll = this.trolls().find((entry) => entry.id === trollId);
    const market = troll?.market;
    const price = this.marketRerollPrice(trollId);
    if (!troll || !market || market.date !== this.marketDate() || troll.gold < price) return false;

    this.trolls.update((trolls) => trolls.map((entry) => {
      if (entry.id !== trollId) return entry;
      const rerolls = market.rerolls + 1;
      return {
        ...entry,
        gold: entry.gold - price,
        market: this.createDailyMarket(entry, market.date, market.upgrades, rerolls),
      };
    }));
    this.persist();
    return true;
  }

  /** Crée un troll après validation de son nom et de ses 40 points initiaux. */
  createTroll(name: string, stats: TrollStats): void {
    const statValues = Object.values(stats);
    if (
      !name.trim() ||
      statValues.some((value) => !Number.isInteger(value) || value < 1) ||
      statValues.reduce((sum, value) => sum + value, 0) !== 40
    ) {
      throw new Error('Un troll doit avoir un nom et exactement 40 points de caractéristiques, avec au moins 1 point par caractéristique.');
    }
    const nextId = Math.max(0, ...this.trolls().map((troll) => troll.id)) + 1;
    const troll: Troll = {
      id: nextId,
      name: name.trim(),
      className: 'Guerrier',
      level: 1,
      xp: 0,
      gold: 50,
      currentHealth: stats.health * 5,
      stats: { ...stats },
      weapon: 'fists',
      inventory: [],
      equipment: {},
      market: { date: this.marketDate(), itemIds: [], upgrades: 0, rerolls: 0 },
      active: this.trolls().length === 0,
    };
    troll.market = this.createDailyMarket(troll, this.marketDate(), 0, 0);
    this.trolls.update((trolls) => [...trolls, troll]);
    this.persist();
  }

  /** Supprime un troll et active un autre personnage si nécessaire. */
  deleteTroll(id: number): void {
    this.trolls.update((trolls) => {
      const remaining = trolls.filter((troll) => troll.id !== id);
      if (!remaining.length || !trolls.some((troll) => troll.id === id && troll.active)) {
        return remaining;
      }
      return remaining.map((troll, index) => ({ ...troll, active: index === 0 }));
    });
    this.persist();
  }

  /** Définit le personnage actif et désactive tous les autres trolls. */
  setActive(id: number): void {
    this.trolls.update((trolls) =>
      trolls.map((troll) => ({ ...troll, active: troll.id === id })),
    );
    this.persist();
  }

  /** Modifie une caractéristique dans les limites des points disponibles. */
  changeStat(id: number, stat: TrollStat, amount: -1 | 1): void {
    this.trolls.update((trolls) =>
      trolls.map((troll) => {
        if (troll.id !== id) return troll;
        const nextValue = troll.stats[stat] + amount;
        const nextStats = { ...troll.stats, [stat]: nextValue };
        if (
          nextValue < 1 ||
          (amount > 0 && totalStatPoints(nextStats) > maxStatPoints(troll.level))
        ) {
          return troll;
        }
        return { ...troll, stats: nextStats };
      }),
    );
    this.persist();
  }

  /** Achète un article disponible aujourd’hui et l’ajoute à l’inventaire du troll. */
  buyEquipment(trollId: number, itemId: string): boolean {
    const item = equipmentItem(itemId, this.catalog.equipment());
    const troll = this.trolls().find((entry) => entry.id === trollId);
    if (
      !item ||
      !troll ||
      !this.dailyMarketEquipmentFor(trollId).some((available) => available.id === itemId) ||
      !canUseEquipment(troll, item) ||
      troll.gold < item.price ||
      (item.category !== 'potion' && troll.inventory.includes(itemId))
    ) return false;

    this.trolls.update((trolls) => trolls.map((entry) =>
      entry.id === trollId
        ? { ...entry, gold: entry.gold - item.price, inventory: [...entry.inventory, item.id] }
        : entry,
    ));
    this.persist();
    return true;
  }

  buyAlchemistPotion(trollId: number, itemId: string): boolean {
    const item = equipmentItem(itemId, this.catalog.equipment());
    const troll = this.trolls().find((entry) => entry.id === trollId);
    if (
      !item ||
      item.category !== 'potion' ||
      !troll ||
      !this.alchemistEquipment().some((available) => available.id === itemId) ||
      troll.gold < item.price
    ) return false;

    this.trolls.update((trolls) => trolls.map((entry) =>
      entry.id === trollId
        ? { ...entry, gold: entry.gold - item.price, inventory: [...entry.inventory, item.id] }
        : entry,
    ));
    this.persist();
    return true;
  }

  /** Achète une amélioration du marché dont le prix croît à chaque achat. */
  upgradeMarket(trollId: number): boolean {
    const troll = this.trolls().find((entry) => entry.id === trollId);
    const price = this.marketUpgradePrice(trollId);
    if (!troll || troll.gold < price) return false;

    this.trolls.update((trolls) => trolls.map((entry) =>
      entry.id === trollId
        ? {
          ...entry,
          gold: entry.gold - price,
          market: {
            ...(entry.market ?? this.createDailyMarket(entry, this.marketDate(), 0, 0)),
            upgrades: (entry.market?.upgrades ?? 0) + 1,
          },
        }
        : entry,
    ));
    this.persist();
    return true;
  }

  /** Équipe un article possédé dans son emplacement dédié. */
  equipEquipment(trollId: number, itemId: string): boolean {
    const item = equipmentItem(itemId, this.catalog.equipment());
    const troll = this.trolls().find((entry) => entry.id === trollId);
    if (!item || !troll || !troll.inventory.includes(itemId) || !canUseEquipment(troll, item)) return false;

    let slot: EquipmentSlot | null = item.slot;
    if (!slot) {
      slot = troll.equipment.consumable1 ? 'consumable2' : 'consumable1';
      if (troll.equipment[slot]) return false;
    }
    this.trolls.update((trolls) => trolls.map((entry) =>
      entry.id === trollId
        ? { ...entry, equipment: { ...entry.equipment, [slot]: itemId } }
        : entry,
    ));
    this.persist();
    return true;
  }

  /** Retire un article d’un emplacement sans le supprimer de l’inventaire. */
  unequipEquipment(trollId: number, slot: EquipmentSlot): void {
    this.trolls.update((trolls) => trolls.map((troll) => {
      if (troll.id !== trollId || !troll.equipment[slot]) return troll;
      const equipment = { ...troll.equipment };
      delete equipment[slot];
      return { ...troll, equipment };
    }));
    this.persist();
  }

  /** Consomme une potion équipée et la retire de l’inventaire. */
  consumeEquipment(trollId: number, slot: 'consumable1' | 'consumable2'): EquipmentItem | null {
    const troll = this.trolls().find((entry) => entry.id === trollId);
    const item = equipmentItem(troll?.equipment[slot], this.catalog.equipment());
    const inventoryIndex = troll?.inventory.indexOf(item?.id ?? '') ?? -1;
    if (!troll || !item || item.category !== 'potion' || inventoryIndex < 0) return null;

    this.trolls.update((trolls) => trolls.map((entry) => {
      if (entry.id !== trollId) return entry;
      const inventory = [...entry.inventory];
      inventory.splice(inventoryIndex, 1);
      const equipment = { ...entry.equipment };
      delete equipment[slot];
      return { ...entry, inventory, equipment };
    }));
    this.persist();
    return item;
  }

  /** Attribue l’expérience et l’or d’une victoire et retourne les niveaux gagnés. */
  awardVictory(id: number, xp: number, gold: number): number {
    let levelsGained = 0;
    this.trolls.update((trolls) =>
      trolls.map((troll) => {
        if (troll.id !== id) return troll;
        let remainingXp = troll.xp + xp;
        let level = troll.level;
        while (remainingXp >= xpForNextLevel(level)) {
          remainingXp -= xpForNextLevel(level);
          level++;
          levelsGained++;
        }
        return { ...troll, xp: remainingXp, level, gold: troll.gold + gold };
      }),
    );
    this.persist();
    return levelsGained;
  }

  /** Attribue l’expérience d’une défaite et retire l’or perdu. */
  awardDefeat(id: number, xp: number, goldLost: number): number {
    let levelsGained = 0;
    this.trolls.update((trolls) =>
      trolls.map((troll) => {
        if (troll.id !== id) return troll;
        let remainingXp = troll.xp + xp;
        let level = troll.level;
        while (remainingXp >= xpForNextLevel(level)) {
          remainingXp -= xpForNextLevel(level);
          level++;
          levelsGained++;
        }
        return {
          ...troll,
          xp: remainingXp,
          level,
          gold: Math.max(0, troll.gold - goldLost),
        };
      }),
    );
    this.persist();
    return levelsGained;
  }
}
