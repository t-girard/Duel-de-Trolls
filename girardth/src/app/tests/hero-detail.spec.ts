import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HeroDetailComponent } from '../components/hero-detail-component/hero-detail-component';
import { equipmentBonus } from '../data/equipment';
import { maxHealth } from '../data/troll';

describe('HeroDetailComponent', () => {
  let component: HeroDetailComponent;
  let fixture: ComponentFixture<HeroDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroDetailComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HeroDetailComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows total hit points and a calculation disclosure for every stat', () => {
    const troll = component.displayedTroll();
    expect(troll).not.toBeNull();
    expect(component.statValue(troll!, 'health')).toBe(maxHealth(troll!, equipmentBonus(troll!, 'health')));
    expect(component.statBreakdown(troll!, 'health')).toContain(`${troll!.stats.health} × 5`);
    expect(component.statBreakdown(troll!, 'attackPhysical')).toContain('Poings : +1');

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.stat-detail summary').length).toBe(6);
    expect(fixture.nativeElement.querySelectorAll('.stat-summary-row').length).toBe(6);
  });
});
