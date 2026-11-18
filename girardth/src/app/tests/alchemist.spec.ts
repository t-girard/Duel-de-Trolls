import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AlchemistComponent } from '../components/alchemist/alchemist';
import { EQUIPMENT } from '../data/equipment';
import { FirebaseCatalogService } from '../services/firebase-catalog-service';
import { FirebasePlayerDataService } from '../services/firebase-player-data-service';

describe('AlchemistComponent', () => {
  let fixture: ComponentFixture<AlchemistComponent>;
  let component: AlchemistComponent;

  beforeEach(async () => {
    localStorage.removeItem('duel-de-trolls');
    await TestBed.configureTestingModule({
      imports: [AlchemistComponent],
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
    fixture = TestBed.createComponent(AlchemistComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => localStorage.removeItem('duel-de-trolls'));

  it('only displays potions and adds a purchased potion to the troll inventory', () => {
    fixture.detectChanges();
    expect(component.items().length).toBeGreaterThan(0);
    expect(component.items().every((item) => item.category === 'potion')).toBe(true);

    const troll = component.service.activeTroll()!;
    component.service.trolls.update((trolls) => trolls.map((entry) =>
      entry.id === troll.id ? { ...entry, gold: 10000 } : entry,
    ));
    component.buy(component.items()[0]);

    expect(component.service.activeTroll()?.inventory).toContain(component.items()[0].id);
    expect(component.message()).toContain('ajouté à l’inventaire');
  });
});
