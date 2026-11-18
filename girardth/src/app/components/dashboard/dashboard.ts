import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STARTING_STATS, STAT_LABELS, TrollStat, TrollStats } from '../../data/troll';
import { attackTypeLabel, equipmentItem } from '../../data/equipment';
import { FirebaseCatalogService } from '../../services/firebase-catalog-service';
import { TrollService } from '../../services/troll-service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  readonly trollService = inject(TrollService);
  private readonly catalog = inject(FirebaseCatalogService);
  readonly name = signal('');
  readonly draftStats = signal<TrollStats>({ ...STARTING_STATS });
  readonly statLabels = STAT_LABELS;
  readonly statClass = (stat: TrollStat): string => `stat-${stat}`;
  readonly statKeys: TrollStat[] = [
    'attackPhysical',
    'attackMagic',
    'defensePhysical',
    'defenseMagic',
    'dodge',
    'health',
  ];
  /** Calcule le nombre de points initiaux encore à répartir. */
  readonly pointsRemaining = computed(
    () => 40 - Object.values(this.draftStats()).reduce((sum, value) => sum + value, 0),
  );

  /** Affiche l’arme équipée ou les poings par défaut. */
  weaponName(trollId: number): string {
    const troll = this.trollService.trolls().find((entry) => entry.id === trollId);
    const weapon = equipmentItem(troll?.equipment.weapon, this.catalog.equipment());
    return weapon ? `${weapon.name} · ${attackTypeLabel(weapon)}` : 'Poings (+1 attaque physique)';
  }

  /** Ajoute ou retire un point lors de la création d’un troll. */
  adjustStat(stat: TrollStat, amount: -1 | 1): void {
    const current = this.draftStats();
    if (amount < 0 && current[stat] <= 1) return;
    if (amount > 0 && this.pointsRemaining() <= 0) return;
    this.draftStats.update((stats) => ({ ...stats, [stat]: stats[stat] + amount }));
  }

  /** Répartit aléatoirement les 34 points libres entre les caractéristiques. */
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

  /** Crée le troll lorsque le nom et la répartition des points sont valides. */
  createTroll(): void {
    const name = this.name().trim();
    if (!name || this.pointsRemaining() !== 0) return;
    this.trollService.createTroll(name, this.draftStats());
    this.name.set('');
    this.draftStats.set({ ...STARTING_STATS });
  }

  /** Demande confirmation avant de supprimer définitivement un personnage. */
  confirmDeletion(trollId: number, trollName: string): void {
    if (globalThis.confirm(`Supprimer définitivement ${trollName} ? Cette action est irréversible.`)) {
      this.trollService.deleteTroll(trollId);
    }
  }
}
