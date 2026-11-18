import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Troll } from '../../data/troll';
import { TrollService } from '../../services/troll-service';
import { LeaderboardComponent } from './leaderboard';

describe('LeaderboardComponent', () => {
  let fixture: ComponentFixture<LeaderboardComponent>;
  let trollService: TrollService;

  beforeEach(async () => {
    localStorage.removeItem('duel-de-trolls');
    await TestBed.configureTestingModule({
      imports: [LeaderboardComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    trollService = TestBed.inject(TrollService);
    fixture = TestBed.createComponent(LeaderboardComponent);
  });

  afterEach(() => localStorage.removeItem('duel-de-trolls'));

  it('shows up to five trolls ordered by level and links to each detail page', () => {
    const trolls = Array.from({ length: 7 }, (_, index): Troll => ({
      id: index + 1,
      name: `Troll ${index + 1}`,
      className: 'Guerrier',
      level: index + 1,
      xp: 0,
      gold: 50,
      stats: {
        attackPhysical: 10,
        attackMagic: 5,
        defensePhysical: 8,
        defenseMagic: 5,
        dodge: 5,
        health: 7,
      },
      weapon: 'fists',
      inventory: [],
      equipment: {},
      active: index === 0,
    }));
    trollService.trolls.set(trolls);

    fixture.detectChanges();

    const entries = fixture.nativeElement.querySelectorAll('.leaderboard-entry') as NodeListOf<HTMLAnchorElement>;
    expect(entries.length).toBe(5);
    expect(entries[0].textContent).toContain('Troll 7');
    expect(entries[0].textContent).toContain('Niv. 7');
    expect(entries[4].textContent).toContain('Troll 3');
    expect(entries[0].getAttribute('href')).toContain('/personnage/7');
  });
});
