import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EquipmentItem, canUseEquipment, itemStatEntries } from '../../data/equipment';
import { TrollService } from '../../services/troll-service';

@Component({
  selector: 'app-market',
  imports: [RouterLink],
  templateUrl: './market.html',
})
export class MarketComponent {
  readonly service = inject(TrollService);
  readonly selectedCategory = signal<'tout' | 'arme' | 'armure'>('tout');
  readonly message = signal('');
  /** Filtre la sélection quotidienne avec la catégorie choisie dans l’interface. */
  readonly items = computed(() => {
    const troll = this.service.activeTroll();
    if (!troll) return [];
    return this.service.dailyMarketEquipment().filter((item) => item.category !== 'potion').filter((item) =>
      (this.selectedCategory() === 'tout' || item.category === this.selectedCategory()),
    );
  });

  readonly itemStatEntries = itemStatEntries;

  /** Actualise la sélection quotidienne dès l’ouverture du marché. */
  constructor() {
    this.service.refreshMarketDay();
  }

  /** Applique un filtre de catégorie après validation de la valeur du formulaire. */
  setCategory(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const category = event.target.value;
    if (category === 'tout' || category === 'arme' || category === 'armure') {
      this.selectedCategory.set(category);
    }
  }

  /** Indique si le troll actif peut acheter l’article sélectionné aujourd’hui. */
  canBuy(item: EquipmentItem): boolean {
    const troll = this.service.activeTroll();
    return !!troll &&
      this.service.dailyMarketEquipmentFor(troll.id).some((available) => available.id === item.id) &&
      canUseEquipment(troll, item) &&
      troll.gold >= item.price;
  }

  /** Vérifie si l’équipement non-consommable est déjà possédé. */
  isOwned(item: EquipmentItem): boolean {
    return item.category !== 'potion' && (this.service.activeTroll()?.inventory.includes(item.id) ?? false);
  }

  /** Effectue l’achat et communique le résultat au joueur. */
  buy(item: EquipmentItem): void {
    const troll = this.service.activeTroll();
    if (!troll) return;
    if (this.service.buyEquipment(troll.id, item.id)) {
      this.message.set(`${item.name} ajouté à l’inventaire.`);
    } else {
      this.message.set('Achat impossible : vérifie ton niveau et ton or.');
    }
  }

  /** Achète une amélioration du marché et affiche le résultat. */
  upgradeMarket(): void {
    const troll = this.service.activeTroll();
    if (!troll) return;
    if (this.service.upgradeMarket(troll.id)) {
      this.message.set('Amélioration achetée : un article supplémentaire sera proposé au prochain renouvellement chez le forgeron.');
    } else {
      this.message.set('Or insuffisant pour améliorer le marché.');
    }
  }

  /** Renouvelle l’étal actif et indique le résultat de la transaction. */
  rerollMarket(): void {
    const troll = this.service.activeTroll();
    if (!troll) return;
    if (this.service.rerollMarket(troll.id)) {
      this.message.set('L’étal a été renouvelé.');
    } else {
      this.message.set('Réinitialisation impossible : vérifie ton or.');
    }
  }
}
