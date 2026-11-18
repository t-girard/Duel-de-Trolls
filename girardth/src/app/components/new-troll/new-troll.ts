import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { STARTING_STATS, STAT_LABELS, TrollStat, TrollStats } from '../../data/troll';
import { TrollService } from '../../services/troll-service';

@Component({
  selector: 'app-new-troll',
  templateUrl: './new-troll.html',
  styleUrl: './new-troll.css',
})
export class NewTrollComponent {
  private readonly router = inject(Router);
  readonly trollService = inject(TrollService);
  readonly name = signal('');
  readonly draftStats = signal<TrollStats>({ ...STARTING_STATS });
  readonly statLabels = STAT_LABELS;
  readonly statKeys: TrollStat[] = [
    'attackPhysical',
    'attackMagic',
    'defensePhysical',
    'defenseMagic',
    'dodge',
    'health',
  ];
  readonly pointsRemaining = computed(
    () => 40 - Object.values(this.draftStats()).reduce((sum, value) => sum + value, 0),
  );

  statClass(stat: TrollStat): string {
    return `stat-${stat}`;
  }

  adjustStat(stat: TrollStat, amount: -1 | 1): void {
    const current = this.draftStats();
    if (amount < 0 && current[stat] <= 1) return;
    if (amount > 0 && this.pointsRemaining() <= 0) return;
    this.draftStats.update((stats) => ({ ...stats, [stat]: stats[stat] + amount }));
  }

  randomizeStats(): void {
    const stats: TrollStats = {
      attackPhysical: 1,
      attackMagic: 1,
      defensePhysical: 1,
      defenseMagic: 1,
      dodge: 1,
      health: 1,
    };
    for (let point = 0; point < 34; point++) {
      const stat = this.statKeys[Math.floor(Math.random() * this.statKeys.length)];
      stats[stat]++;
    }
    this.draftStats.set(stats);
  }

  createTroll(): void {
    const name = this.name().trim();
    if (!name || this.pointsRemaining() !== 0) return;
    this.trollService.createTroll(name, this.draftStats());
    this.close();
  }

  close(): void {
    void this.router.navigate(['/profil']);
  }
}
