import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DashboardComponent } from '../components/dashboard/dashboard';
import { TrollService } from '../services/troll-service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let trollService: TrollService;

  beforeEach(async () => {
    localStorage.removeItem('duel-de-trolls');
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([
        { path: 'dashboard', component: DashboardComponent },
        { path: 'personnages', component: DashboardComponent },
      ])],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    trollService = TestBed.inject(TrollService);
    await fixture.whenStable();
  });

  /** Retire les données de test pour ne pas influencer les autres suites. */
  afterEach(() => localStorage.removeItem('duel-de-trolls'));

  /** Vérifie que la liste reste l’écran principal même avec un troll actif. */
  it('shows the roster by default when a character is active', () => {
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.troll-card');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Gorgrim');
    expect(card.querySelector('.active-tag')?.textContent).toContain('ACTIF');
    expect(card.querySelector('.text-link')?.getAttribute('href')).toBe('/personnage/1');
  });

  /** Vérifie que la route de liste dédiée reste accessible au bouton retour. */
  it('shows the roster when navigating to the character list route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/personnages', DashboardComponent);

    expect(harness.routeNativeElement?.querySelector('.troll-list')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelectorAll('.delete-troll-button').length).toBe(1);
  });

  /** Vérifie que la liste est conservée lorsqu’aucun personnage n’est actif. */
  it('shows the character list when no character is active', () => {
    trollService.trolls.update((trolls) => trolls.map((troll) => ({ ...troll, active: false })));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.troll-list .troll-card').length).toBe(1);
    expect(fixture.nativeElement.querySelector('#troll-name')).not.toBeNull();
  });

  /** Vérifie que la suppression passe par la confirmation native. */
  it('deletes a character only after confirmation', () => {
    const troll = trollService.activeTroll()!;
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

    component.confirmDeletion(troll.id, troll.name);
    expect(trollService.trolls()).toHaveLength(1);

    confirmSpy.mockReturnValue(true);
    component.confirmDeletion(troll.id, troll.name);
    expect(trollService.trolls()).toHaveLength(0);
    confirmSpy.mockRestore();
  });

  /** Confirme le bon affichage du composant de création. */
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /** Confirme que la répartition aléatoire respecte le total de 40 points. */
  it('randomizes valid stats totaling exactly 40 points', () => {
    component.randomizeStats();

    const stats = component.draftStats();
    expect(Object.values(stats).every((value) => value >= 1)).toBe(true);
    expect(Object.values(stats).reduce((sum, value) => sum + value, 0)).toBe(40);
    expect(component.pointsRemaining()).toBe(0);
  });

  /** Confirme les limites minimales et maximales de la répartition. */
  it('does not allow creation stats to exceed the remaining points or drop below one', () => {
    component.adjustStat('attackPhysical', 1);
    expect(component.draftStats().attackPhysical).toBe(10);

    component.adjustStat('attackPhysical', -1);
    component.adjustStat('attackMagic', 1);
    expect(component.draftStats().attackMagic).toBe(6);
    expect(component.pointsRemaining()).toBe(0);

    for (let point = 0; point < 20; point++) {
      component.adjustStat('attackPhysical', -1);
    }
    expect(component.draftStats().attackPhysical).toBe(1);
    expect(component.pointsRemaining()).toBe(8);
  });
});
