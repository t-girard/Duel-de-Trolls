import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MarketComponent } from '../components/market/market';
import { TrollService } from '../services/troll-service';
import { FirebaseCatalogService } from '../services/firebase-catalog-service';
import { FirebasePlayerDataService } from '../services/firebase-player-data-service';
import { EQUIPMENT } from '../data/equipment';
import { signal } from '@angular/core';

describe('MarketComponent', () => {
  let component: MarketComponent;
  let fixture: ComponentFixture<MarketComponent>;

  beforeEach(async () => {
    localStorage.removeItem('duel-de-trolls');
    localStorage.removeItem('duel-de-trolls-market-upgrades');
    await TestBed.configureTestingModule({
      imports: [MarketComponent],
      providers: [
        provideRouter([]),
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
    }).compileComponents();

    fixture = TestBed.createComponent(MarketComponent);
    component = fixture.componentInstance;
  });

  /** Nettoie la sauvegarde partagée après chaque test du marché. */
  afterEach(() => {
    localStorage.removeItem('duel-de-trolls');
    localStorage.removeItem('duel-de-trolls-market-upgrades');
  });

  /** Vérifie le rendu de la sélection sans tenter d’itérer sur des signaux. */
  it('renders the available daily equipment list', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.market-item').length).toBe(component.items().length);
    expect(fixture.nativeElement.querySelector('.market-upgrade')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.market-reroll')?.textContent).toContain('100 or');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('forgeron');
    expect(component.items().every((item) => item.category !== 'potion')).toBe(true);
    expect(fixture.nativeElement.querySelector('.market-reroll button')?.textContent).toContain('Réinitialiser le forgeron');
  });

  /** Vérifie que le filtre limite la liste aux articles d’une catégorie. */
  it('filters daily equipment by category', () => {
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'arme';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.items().every((item) => item.category === 'arme')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.market-item').length).toBe(component.items().length);
  });

  it('lets the active character pay to renew their own market stock', () => {
    const troll = component.service.activeTroll()!;
    component.service.trolls.update((trolls) => trolls.map((entry) =>
      entry.id === troll.id ? { ...entry, gold: 500 } : entry,
    ));
    const previousStock = component.service.dailyMarketEquipmentFor(troll.id).map((item) => item.id);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.market-reroll button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    fixture.detectChanges();

    expect(component.service.activeTroll()?.gold).toBe(400);
    expect(component.service.marketRerollPrice(troll.id)).toBe(150);
    expect(component.service.dailyMarketEquipmentFor(troll.id).map((item) => item.id)).not.toEqual(previousStock);
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('renouvelé');
  });

  /** Vérifie la liaison du composant au service de trolls. */
  it('uses the application troll service', () => {
    expect(component.service).toBe(TestBed.inject(TrollService));
  });
});
