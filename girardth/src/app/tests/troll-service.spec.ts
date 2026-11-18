import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { maxHealth, maxStatPoints, STARTING_STATS } from '../data/troll';
import { EQUIPMENT, effectiveStat } from '../data/equipment';
import { TrollService } from '../services/troll-service';
import { FirebaseCatalogService } from '../services/firebase-catalog-service';
import { FirebasePlayerDataService } from '../services/firebase-player-data-service';

describe('TrollService', () => {
  let service: TrollService;

  function offerItems(...itemIds: string[]): void {
    service.trolls.update((trolls) => trolls.map((troll) => ({
      ...troll,
      market: { date: service.marketDate(), itemIds, upgrades: 100, rerolls: 0 },
    })));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem('duel-de-trolls');
    localStorage.removeItem('duel-de-trolls-market-upgrades');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FirebaseCatalogService,
          useValue: {
            firebaseEnabled: false,
            equipment: signal(EQUIPMENT),
            equipmentLoaded: signal(false),
          },
        },
        {
          provide: FirebasePlayerDataService,
          useValue: { enabled: false, start: () => undefined, save: () => undefined },
        },
      ],
    });
    service = TestBed.inject(TrollService);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('duel-de-trolls');
    localStorage.removeItem('duel-de-trolls-market-upgrades');
  });

  it('creates a troll and activates it when it is the first one', () => {
    service.trolls.set([]);
    service.createTroll(' Brak ', { ...STARTING_STATS });

    expect(service.activeTroll()?.name).toBe('Brak');
    expect(service.activeTroll()?.stats).toEqual(STARTING_STATS);
    expect(service.activeTroll()?.weapon).toBe('fists');
    expect(effectiveStat(service.activeTroll()!, 'attackPhysical')).toBe(11);
  });

  it('persists health damage and regenerates one point every five seconds outside combat', () => {
    const troll = service.activeTroll()!;
    service.setCurrentHealth(troll.id, 12);

    vi.advanceTimersByTime(5000);
    expect(service.activeTroll()?.currentHealth).toBe(13);

    service.beginCombat(troll.id);
    vi.advanceTimersByTime(10000);
    expect(service.activeTroll()?.currentHealth).toBe(13);

    service.endCombat(troll.id);
    vi.advanceTimersByTime(5000);
    expect(service.activeTroll()?.currentHealth).toBe(14);
  });

  it('migrates saved starter weapons to fists', () => {
    const savedTroll = { ...service.activeTroll()!, weapon: 'sword' };
    localStorage.setItem('duel-de-trolls', JSON.stringify([savedTroll]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FirebaseCatalogService,
          useValue: {
            firebaseEnabled: false,
            equipment: signal(EQUIPMENT),
            equipmentLoaded: signal(false),
          },
        },
        {
          provide: FirebasePlayerDataService,
          useValue: { enabled: false, start: () => undefined, save: () => undefined },
        },
      ],
    });
    service = TestBed.inject(TrollService);

    expect(service.activeTroll()?.weapon).toBe('fists');
    expect(effectiveStat(service.activeTroll()!, 'attackPhysical')).toBe(11);
  });

  it('deletes the active troll and activates the next remaining troll', () => {
    const first = service.activeTroll()!;
    service.createTroll('Brak', { ...STARTING_STATS });
    const second = service.trolls()[1];

    service.deleteTroll(first.id);

    expect(service.trolls()).toHaveLength(1);
    expect(service.activeTroll()?.id).toBe(second.id);
  });

  it('deletes the last troll without creating a replacement', () => {
    const troll = service.activeTroll()!;

    service.deleteTroll(troll.id);

    expect(service.trolls()).toEqual([]);
    expect(service.activeTroll()).toBeNull();
  });

  it('does not change the active character when deleting an inactive troll', () => {
    const active = service.activeTroll()!;
    service.createTroll('Brak', { ...STARTING_STATS });
    const inactive = service.trolls()[1];

    service.deleteTroll(inactive.id);

    expect(service.trolls()).toHaveLength(1);
    expect(service.activeTroll()?.id).toBe(active.id);
  });

  it('rejects an invalid starting stat distribution', () => {
    expect(() => service.createTroll('Brak', { ...STARTING_STATS, health: 8 })).toThrow();
  });

  it('awards levels and skill points while preserving the fists as the default', () => {
    const troll = service.activeTroll()!;

    const levelsGained = service.awardVictory(troll.id, 100, 20);

    expect(levelsGained).toBe(1);
    expect(service.activeTroll()).toMatchObject({
      level: 2,
      xp: 0,
      gold: 70,
      weapon: 'fists',
    });
    expect(effectiveStat(service.activeTroll()!, 'attackPhysical')).toBe(12);
    expect(effectiveStat(service.activeTroll()!, 'attackMagic')).toBe(6);
    expect(effectiveStat(service.activeTroll()!, 'defensePhysical')).toBe(9);
    expect(effectiveStat(service.activeTroll()!, 'defenseMagic')).toBe(6);
    expect(effectiveStat(service.activeTroll()!, 'dodge')).toBe(6);
    expect(maxHealth(service.activeTroll()!)).toBe(40);
    expect(service.activeTroll()?.stats).toEqual(STARTING_STATS);
    expect(maxStatPoints(2) - Object.values(service.activeTroll()!.stats).reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  it('allows free stat redistribution within the level cap and keeps every stat above zero', () => {
    const troll = service.activeTroll()!;
    expect(maxStatPoints(troll.level)).toBe(40);

    service.changeStat(troll.id, 'dodge', -1);
    service.changeStat(troll.id, 'attackPhysical', 1);
    expect(service.activeTroll()?.stats.attackPhysical).toBe(11);
    service.changeStat(troll.id, 'attackMagic', 1);
    expect(service.activeTroll()?.stats.attackMagic).toBe(5);
    service.changeStat(troll.id, 'defenseMagic', 1);
    expect(service.activeTroll()?.stats.defenseMagic).toBe(5);
    service.changeStat(troll.id, 'dodge', -1);
    expect(service.activeTroll()?.stats.dodge).toBe(3);
    for (let point = 0; point < 10; point++) {
      service.changeStat(troll.id, 'dodge', -1);
    }
    expect(service.activeTroll()?.stats.dodge).toBe(1);
  });

  it('adds five hit points for every skill point assigned to health', () => {
    const troll = service.activeTroll()!;
    expect(maxHealth(troll)).toBe(35);

    service.changeStat(troll.id, 'attackMagic', -1);
    service.changeStat(troll.id, 'health', 1);

    expect(maxHealth(service.activeTroll()!)).toBe(40);
    expect(maxHealth(service.activeTroll()!, 8)).toBe(48);
  });

  it('buys and equips catalog equipment and applies its stat bonuses', () => {
    const troll = service.activeTroll()!;
    expect(effectiveStat(troll, 'attackPhysical')).toBe(11);
    offerItems(...EQUIPMENT.map((item) => item.id));
    service.trolls.update((trolls) => trolls.map((entry) => ({ ...entry, gold: 500 })));

    expect(service.buyEquipment(troll.id, 'epee-rouillee')).toBe(true);
    expect(service.activeTroll()?.gold).toBe(50);
    expect(service.equipEquipment(troll.id, 'epee-rouillee')).toBe(true);
    expect(effectiveStat(service.activeTroll()!, 'attackPhysical')).toBe(15);
    expect(service.activeTroll()?.equipment.weapon).toBe('epee-rouillee');
    service.unequipEquipment(troll.id, 'weapon');
    expect(effectiveStat(service.activeTroll()!, 'attackPhysical')).toBe(11);
    expect(service.buyEquipment(troll.id, 'epee-rouillee')).toBe(false);
  });

  it('keeps unaffordable equipment out of the inventory and supports consumable slots', () => {
    const troll = service.activeTroll()!;
    offerItems(...EQUIPMENT.map((item) => item.id));
    service.trolls.update((trolls) => trolls.map((entry) => ({ ...entry, gold: 5000 })));

    expect(service.buyEquipment(troll.id, 'espadon-pierre')).toBe(false);
    expect(service.activeTroll()?.inventory).toEqual([]);
    expect(service.buyEquipment(troll.id, 'potion-force')).toBe(true);
    expect(service.equipEquipment(troll.id, 'potion-force')).toBe(true);
    expect(service.activeTroll()?.equipment.consumable1).toBe('potion-force');
    expect(effectiveStat(service.activeTroll()!, 'attackPhysical')).toBe(11);
    const potion = service.consumeEquipment(troll.id, 'consumable1');
    expect(potion?.name).toBe('Potion de force brute');
    expect(potion?.stats.attackPhysical).toBe(4);
    expect(effectiveStat(service.activeTroll()!, 'attackPhysical')).toBe(11);
    expect(service.activeTroll()?.inventory).toEqual([]);
    expect(service.activeTroll()?.equipment.consumable1).toBeUndefined();
  });

  it('keeps each character’s daily stock and market upgrades separate', () => {
    const first = service.activeTroll()!;
    service.createTroll('Brak', { ...STARTING_STATS });
    const second = service.trolls()[1];
    service.trolls.update((trolls) => trolls.map((entry) => ({ ...entry, gold: 5000 })));

    const firstStock = service.dailyMarketEquipmentFor(first.id);
    const secondStock = service.dailyMarketEquipmentFor(second.id);
    expect(firstStock).toHaveLength(5);
    expect(secondStock).toHaveLength(5);
    expect(firstStock.map((item) => item.id)).not.toEqual(secondStock.map((item) => item.id));
    service.setActive(second.id);
    expect(service.dailyMarketEquipment().map((item) => item.id)).toEqual(secondStock.map((item) => item.id));
    service.setActive(first.id);
    const purchasedItem = firstStock[0];
    expect(service.buyEquipment(first.id, purchasedItem.id)).toBe(true);
    expect(service.trolls().find((entry) => entry.id === first.id)?.inventory).toContain(purchasedItem.id);
    expect(service.trolls().find((entry) => entry.id === second.id)?.inventory).not.toContain(purchasedItem.id);

    service.trolls.update((trolls) => trolls.map((entry) => ({ ...entry, gold: 5000 })));
    expect(service.marketUpgradePrice(first.id)).toBe(500);
    expect(service.upgradeMarket(first.id)).toBe(true);
    expect(service.marketStockCapacity(first.id)).toBe(6);
    expect(service.marketUpgradePrice(first.id)).toBe(1000);
    expect(service.marketUpgradePrice(second.id)).toBe(500);
    expect(service.dailyMarketEquipmentFor(first.id)).toHaveLength(5);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    service.refreshMarketDay(tomorrow);

    expect(service.dailyMarketEquipmentFor(first.id)).toHaveLength(6);
    expect(service.dailyMarketEquipmentFor(second.id)).toHaveLength(5);
  });

  it('keeps a character’s selected stock unchanged until the day changes', () => {
    const troll = service.activeTroll()!;
    const today = new Date();
    service.refreshMarketDay(today);
    const dateToday = service.marketDate();
    const stockToday = service.dailyMarketEquipmentFor(troll.id).map((item) => item.id);
    service.trolls.update((trolls) => trolls.map((entry) => entry.id === troll.id
      ? { ...entry, level: 10 }
      : entry));
    expect(service.dailyMarketEquipmentFor(troll.id).map((item) => item.id)).toEqual(stockToday);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    service.refreshMarketDay(tomorrow);
    expect(service.marketDate()).not.toBe(dateToday);
    const stockTomorrow = service.dailyMarketEquipmentFor(troll.id).map((item) => item.id);
    expect(stockTomorrow).toHaveLength(5);
    expect(stockTomorrow).not.toEqual(stockToday);
    const savedTrolls = JSON.parse(localStorage.getItem('duel-de-trolls') ?? '[]');
    expect(savedTrolls[0].market.date).toBe(service.marketDate());
    expect(savedTrolls[0].market.itemIds).toEqual(stockTomorrow);
  });

  it('charges 100 gold then 50 more per reroll and resets that price at midnight', () => {
    const first = service.activeTroll()!;
    service.createTroll('Brak', { ...STARTING_STATS });
    const second = service.trolls()[1];
    service.trolls.update((trolls) => trolls.map((entry) => ({ ...entry, gold: 1000 })));
    const initialStock = service.dailyMarketEquipmentFor(first.id).map((item) => item.id);
    const otherStock = service.dailyMarketEquipmentFor(second.id).map((item) => item.id);

    expect(service.marketRerollPrice(first.id)).toBe(100);
    expect(service.rerollMarket(first.id)).toBe(true);
    const firstRerollStock = service.dailyMarketEquipmentFor(first.id).map((item) => item.id);
    expect(firstRerollStock).not.toEqual(initialStock);
    expect(service.trolls().find((entry) => entry.id === first.id)?.gold).toBe(900);
    expect(service.dailyMarketEquipmentFor(second.id).map((item) => item.id)).toEqual(otherStock);
    expect(service.marketRerollPrice(first.id)).toBe(150);

    expect(service.rerollMarket(first.id)).toBe(true);
    expect(service.marketRerollPrice(first.id)).toBe(200);
    expect(service.trolls().find((entry) => entry.id === first.id)?.gold).toBe(750);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    service.refreshMarketDay(tomorrow);
    expect(service.marketRerollPrice(first.id)).toBe(100);
    expect(service.trolls().find((entry) => entry.id === first.id)?.market?.rerolls).toBe(0);
    expect(service.rerollMarket(first.id)).toBe(true);
  });

  it('does not reroll the market when the character cannot afford it', () => {
    const troll = service.activeTroll()!;
    const stockBefore = service.dailyMarketEquipmentFor(troll.id).map((item) => item.id);

    expect(service.marketRerollPrice(troll.id)).toBe(100);
    expect(service.rerollMarket(troll.id)).toBe(false);
    expect(service.dailyMarketEquipmentFor(troll.id).map((item) => item.id)).toEqual(stockBefore);
    expect(service.activeTroll()?.gold).toBe(troll.gold);
  });

  it('migrates the former shared market upgrade to only the active character', () => {
    service.createTroll('Brak', { ...STARTING_STATS });
    const oldSave = service.trolls().map(({ market: _market, ...troll }) => troll);
    localStorage.setItem('duel-de-trolls', JSON.stringify(oldSave));
    localStorage.setItem('duel-de-trolls-market-upgrades', '2');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TrollService);

    expect(service.activeTroll()?.market?.upgrades).toBe(2);
    expect(service.trolls()[1].market?.upgrades).toBe(0);
    expect(localStorage.getItem('duel-de-trolls-market-upgrades')).toBeNull();
  });

  it('only allows purchase of items in today’s market selection and applies tenfold prices', () => {
    const troll = service.activeTroll()!;
    service.trolls.update((trolls) => trolls.map((entry) => ({ ...entry, gold: 5000 })));
    const stock = service.dailyMarketEquipment();
    const unavailable = ['gourdasse-bois', 'epee-rouillee', 'calotte-fer', 'jambieres-cuir',
      'bottes-fer', 'gantelets-fer', 'potion-force', 'potion-carapace', 'infusion-vigueur']
      .find((id) => !stock.some((item) => item.id === id));

    expect(stock).toHaveLength(5);
    expect(unavailable).toBeDefined();
    expect(service.buyEquipment(troll.id, unavailable!)).toBe(false);
    expect(stock.every((item) => item.price >= 250)).toBe(true);
  });
});
