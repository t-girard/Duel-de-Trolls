import { Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  maxHealth,
  maxStatPoints,
  levelStatBonus,
  STAT_LABELS,
  totalStatPoints,
  Troll,
  TrollStat,
} from '../../data/troll';
import {
  EQUIPMENT_SLOTS,
  EquipmentItem,
  EquipmentSlot,
  equipmentBonus,
  equipmentItem,
  effectiveStat,
  itemStatEntries,
} from '../../data/equipment';
import { TrollService } from '../../services/troll-service';
import { FirebaseCatalogService } from '../../services/firebase-catalog-service';

@Component({
  selector: 'app-troll-detail',
  imports: [RouterLink],
  templateUrl: './hero-detail-component.html',
  // styleUrl retiré : tous les styles sont désormais dans src/styles.css
})
export class HeroDetailComponent {
  readonly trollId = input<number | null>(null);
  readonly service = inject(TrollService);
  private readonly catalog = inject(FirebaseCatalogService);
  private readonly route = inject(ActivatedRoute);
  /** Extrait un identifiant de personnage valide depuis l’URL. */
  private readonly routeTrollId = toSignal(
    this.route.paramMap.pipe(map((params) => {
      const id = Number(params.get('id'));
      return Number.isInteger(id) && id > 0 ? id : null;
    })),
    { initialValue: null },
  );
  /** Choisit le troll de la route ou, sans identifiant, le troll actif. */
  readonly displayedTroll = computed(() => {
    const id = this.trollId() ?? this.routeTrollId();
    return id === null
      ? this.service.activeTroll()
      : this.service.trolls().find((troll) => troll.id === id) ?? null;
  });
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
  readonly equipmentSlots = EQUIPMENT_SLOTS;
  readonly itemStatEntries = itemStatEntries;

  /** Calcule la valeur effective d’une caractéristique, dont le total de PV. */
  statValue(troll: Troll, stat: TrollStat): number {
    if (stat === 'health') return maxHealth(troll, equipmentBonus(troll, 'health', this.catalog.equipment()));
    return effectiveStat(troll, stat, this.catalog.equipment());
  }

  /** Décompose une caractéristique : base investie, bonus de niveau, bonus d’équipement et total. */
  statParts(troll: Troll, stat: TrollStat): { base: number; level: number; gear: number; total: number } {
    const gear = equipmentBonus(troll, stat, this.catalog.equipment());
    if (stat === 'health') {
      return { base: troll.stats.health * 5, level: (troll.level - 1) * 5, gear, total: this.statValue(troll, stat) };
    }
    return { base: troll.stats[stat], level: levelStatBonus(troll, stat), gear, total: this.statValue(troll, stat) };
  }

  /** Retourne le détail lisible des contributions à une caractéristique. */
  statBreakdown(troll: Troll, stat: TrollStat): string {
    const parts = this.statParts(troll, stat);
    if (stat === 'health') {
      return `${troll.stats.health} × 5 · Niveau +${parts.level} · Équipement ${parts.gear >= 0 ? '+' : ''}${parts.gear}`;
    }
    const fists = stat === 'attackPhysical' && !troll.equipment.weapon ? 'Poings : +1' : '';
    const gear = parts.gear !== 1 || fists ? `Équipement ${parts.gear >= 0 ? '+' : ''}${parts.gear}` : '';
    return [fists, `Base ${parts.base}`, `Niveau +${parts.level}`, gear].filter(Boolean).join(' · ');
  }

  /** Donne une longueur lisible à la barre, plafonnée à une échelle de référence. */
  statBarPercent(troll: Troll, stat: TrollStat): number {
    return Math.min(100, this.statValue(troll, stat));
  }

  /** Résout les identifiants possédés en objets du catalogue. */
  ownedItems(troll: Troll): EquipmentItem[] {
    return troll.inventory
      .map((id) => this.catalog.equipment().find((item) => item.id === id))
      .filter((item): item is EquipmentItem => !!item);
  }

  /** Retourne l’objet actuellement équipé dans un emplacement donné. */
  equippedItem(troll: Troll, slot: EquipmentSlot): EquipmentItem | undefined {
    return equipmentItem(troll.equipment[slot], this.catalog.equipment());
  }

  /** Indique si l’objet figure dans un emplacement équipé. */
  isEquipped(troll: Troll, item: EquipmentItem): boolean {
    return Object.values(troll.equipment).includes(item.id);
  }

  /** Équipe un objet de l’inventaire sur le troll correspondant. */
  equipItem(trollId: number, itemId: string): void {
    this.service.equipEquipment(trollId, itemId);
  }

  /** Retire l’objet de son emplacement sans le détruire. */
  unequipItem(trollId: number, slot: EquipmentSlot): void {
    this.service.unequipEquipment(trollId, slot);
  }

  /** Demande au service de modifier une caractéristique. */
  changeStat(trollId: number, stat: TrollStat, amount: -1 | 1): void {
    this.service.changeStat(trollId, stat, amount);
  }

  /** Calcule la somme des points investis dans les caractéristiques. */
  totalPoints(troll: Troll): number {
    return totalStatPoints(troll.stats);
  }

  /** Calcule le plafond de points d’un personnage selon son niveau. */
  maxPoints(troll: Troll): number {
    return maxStatPoints(troll.level);
  }

  /** Retourne les points encore disponibles pour la répartition. */
  pointsAvailable(troll: Troll): number {
    return this.maxPoints(troll) - totalStatPoints(troll.stats);
  }

  /** Calcule le pourcentage d’expérience du niveau courant. */
  xpProgress(troll: Troll): number {
    return Math.min(100, (troll.xp / (100 + (troll.level - 1) * 50)) * 100);
  }

  /** Active le personnage avant de naviguer vers l’arène. */
  enterArena(trollId: number): void {
    this.service.setActive(trollId);
  }
}
