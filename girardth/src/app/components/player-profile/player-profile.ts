import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { attackTypeLabel, equipmentItem } from '../../data/equipment';
import { FirebaseCatalogService } from '../../services/firebase-catalog-service';
import { TrollService } from '../../services/troll-service';
import { HeroDetailComponent } from '../hero-detail-component/hero-detail-component';

@Component({
  selector: 'app-player-profile',
  imports: [RouterLink, HeroDetailComponent],
  templateUrl: './player-profile.html',
  styleUrl: './player-profile.css',
})
export class PlayerProfileComponent {
  readonly trollService = inject(TrollService);
  private readonly catalog = inject(FirebaseCatalogService);
  readonly selectedMessage = signal('');
  readonly detailTrollId = signal<number | null>(null);

  readonly totalGold = computed(() =>
    this.trollService.trolls().reduce((sum, troll) => sum + troll.gold, 0),
  );
  readonly highestLevel = computed(() =>
    this.trollService.trolls().reduce((highest, troll) => Math.max(highest, troll.level), 0),
  );

  weaponLabel(trollId: number): string {
    const troll = this.trollService.trolls().find((entry) => entry.id === trollId);
    const weapon = equipmentItem(troll?.equipment.weapon, this.catalog.equipment());
    return weapon ? `${weapon.name} · ${attackTypeLabel(weapon)}` : 'Poings · Attaque physique';
  }

  setActive(trollId: number, trollName: string): void {
    this.trollService.setActive(trollId);
    this.selectedMessage.set(`${trollName} est maintenant ton troll actif.`);
  }

  openDetails(trollId: number): void {
    this.detailTrollId.set(trollId);
  }

  closeDetails(): void {
    this.detailTrollId.set(null);
  }

  @HostListener('document:keydown.escape')
  closeDetailsWithEscape(): void {
    if (this.detailTrollId() !== null) this.closeDetails();
  }
}
