import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArenaComponent } from '../components/arena/arena';
import { TrollService } from '../services/troll-service';
import { FirebaseCatalogService } from '../services/firebase-catalog-service';
import { FirebasePlayerDataService } from '../services/firebase-player-data-service';
import { EQUIPMENT } from '../data/equipment';
import { signal } from '@angular/core';

const enemyCsv = (rows: string, zone = 'arena') =>
  `nom,categorie,attaque_physique,attaque_magique,defense_physique,defense_magique,esquive,vie,or,xp,zone\n${rows.split('\n').map((row) => `${row},${zone}`).join('\n')}`;

describe('ArenaComponent', () => {
  let component: ArenaComponent;
  let fixture: ComponentFixture<ArenaComponent>;
  let service: TrollService;

  beforeEach(async () => {
    localStorage.removeItem('duel-de-trolls');
    await TestBed.configureTestingModule({
      imports: [ArenaComponent],
      providers: [
        provideRouter([]),
        {
          provide: FirebaseCatalogService,
          useValue: {
            firebaseEnabled: false,
            equipment: signal(EQUIPMENT),
            equipmentLoaded: signal(false),
            enemies: signal([]),
            enemiesLoaded: signal(false),
          },
        },
        {
          provide: FirebasePlayerDataService,
          useValue: { enabled: false, start: () => undefined, save: () => undefined },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ArenaComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(TrollService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.removeItem('duel-de-trolls');
  });

  function mockEnemyFile(csv: string): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => csv,
    }));
  }

  it('chooses an enemy from the selected zone and scales its stats by level', async () => {
    mockEnemyFile(enemyCsv([
      'Gobelin test,gobelin,3,0,1,0,3,18,5,10',
      'Chaman test,gobelin,0,6,1,3,2,20,12,20',
    ].join('\n')));
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    await component.startFight();
    fixture.detectChanges();

    expect(component.enemy()).toMatchObject({
      name: 'Chaman test',
      category: 'gobelin',
      attackMagic: 18,
      level: 3,
      maxHp: 60,
      gold: 36,
      xp: 60,
    });
    expect(fixture.nativeElement.textContent).toContain('Chaman test');
    expect(fixture.nativeElement.textContent).toContain('Attaque magique');
    expect(fixture.nativeElement.textContent).toContain('NIVEAU 3');
  });

  it('uses the selected forest zone and multiplies its rewards by the enemy level', async () => {
    mockEnemyFile(enemyCsv('Sanglier test,bête,7,0,4,0,1,40,3,25', 'foret'));
    component.selectedZone.set('foret');
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await component.startFight();
    component.fighter.update((troll) => troll
      ? { ...troll, stats: { ...troll.stats, attackPhysical: 1000 } }
      : troll);

    expect(component.enemy()).toMatchObject({
      zone: 'foret',
      level: 3,
      attackPhysical: 21,
      maxHp: 120,
      gold: 9,
      xp: 75,
    });

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    component.takeTurn('attack');
    expect(component.rewards()).toEqual({ xp: 75, gold: 9 });
  });

  it('consumes an equipped potion during a battle without advancing the turn', async () => {
    mockEnemyFile(enemyCsv('Gobelin test,gobelin,3,0,1,0,3,18,5,10'));
    const troll = service.activeTroll()!;
    service.trolls.update((trolls) => trolls.map((entry) => entry.id === troll.id
      ? { ...entry, inventory: ['potion-force'], equipment: { consumable1: 'potion-force' } }
      : entry));
    await component.startFight();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const potionButton = Array.from(buttons)
      .find((button) => button.textContent?.includes('Potion de force brute'));
    expect(potionButton).toBeDefined();
    potionButton!.click();
    fixture.detectChanges();

    expect(component.fighter()?.stats.attackPhysical).toBe(troll.stats.attackPhysical + 4);
    expect(component.turn()).toBe(0);
    expect(service.trolls()[0].inventory).toEqual([]);
    expect(service.trolls()[0].equipment.consumable1).toBeUndefined();
  });

  it('shows the CSV enemy rewards with an illustrated victory result', async () => {
    mockEnemyFile(enemyCsv('Gobelin test,gobelin,3,0,1,0,3,18,5,10'));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await component.startFight();
    component.fighter.update((troll) => troll
      ? { ...troll, stats: { ...troll.stats, attackPhysical: 1000 } }
      : troll);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    component.takeTurn('attack');
    fixture.detectChanges();

    expect(component.result()).toBe('victory');
    expect(component.rewards()).toEqual({ xp: 10, gold: 5 });
    expect(fixture.nativeElement.querySelector('.outcome-illustration svg')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.reward-grid').textContent).toContain('+10');
    expect(fixture.nativeElement.querySelector('.reward-grid').textContent).toContain('+5');
  });

  it('shows the XP gained and gold lost after a defeat', async () => {
    mockEnemyFile(enemyCsv('Champion test,orc,100,0,1,0,0,80,25,80'));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await component.startFight();
    component.playerHp.set(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    component.takeTurn('defend');
    fixture.detectChanges();

    expect(component.result()).toBe('defeat');
    expect(component.rewards()).toEqual({ xp: 1, gold: -5 });
    expect(service.activeTroll()?.xp).toBe(1);
    expect(fixture.nativeElement.querySelector('.reward-grid').textContent).toContain('+1');
    expect(fixture.nativeElement.querySelector('.reward-grid').textContent).toContain('-5');
  });

  it('reports an enemy-file loading error instead of starting a placeholder fight', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await component.startFight();

    expect(component.enemy()).toBeNull();
    expect(component.arenaError()).toContain('404');
  });
});
