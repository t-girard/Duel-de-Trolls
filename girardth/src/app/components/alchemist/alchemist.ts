import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EquipmentItem, canUseEquipment, itemStatEntries } from '../../data/equipment';
import { TrollService } from '../../services/troll-service';

@Component({
  selector: 'app-alchemist',
  imports: [RouterLink],
  templateUrl: './alchemist.html',
})
export class AlchemistComponent {
  readonly service = inject(TrollService);
  readonly message = signal('');
  readonly items = computed(() => this.service.alchemistEquipment());
  readonly itemStatEntries = itemStatEntries;

  canBuy(item: EquipmentItem): boolean {
    const troll = this.service.activeTroll();
    return !!troll && canUseEquipment(troll, item) && troll.gold >= item.price;
  }

  buy(item: EquipmentItem): void {
    const troll = this.service.activeTroll();
    if (!troll) return;
    this.message.set(this.service.buyAlchemistPotion(troll.id, item.id)
      ? `${item.name} ajouté à l’inventaire.`
      : 'Achat impossible : vérifie ton niveau et ton or.');
  }
}
