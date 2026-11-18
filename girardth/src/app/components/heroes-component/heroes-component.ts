import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { HeroInterface } from '../../data/heroInterface';
import { form, FormField } from '@angular/forms/signals';
import { HEROES } from '../../data/mock-heroes';
import { HeroService } from '../../services/hero-service';
import { MessageManager } from '../message-manager-component/message-manager';
import { MessageService } from '../../services/message-service';
import { RouterLink } from '@angular/router';

@Component({
  imports: [FormField, MessageManager, RouterLink],
  selector: 'app-heroes-component',
  styleUrl: './heroes-component.css',
  templateUrl: './heroes-component.html',
  providers: [MessageService, HeroService],
})
export class HeroesComponent implements OnInit {
  hero: HeroInterface = {
    id: 1,
    name: 'Windstorm',
    actif: true,
  };

  heroModel = signal<HeroInterface>({
    id: 1,
    name: 'Hervé',
    actif: true,
  });

  heroForm = form(this.heroModel);

  heroNameModelCapitalized = computed(() => this.heroModel().name.toUpperCase());

  // Injection du service HeroService
  private heroService = inject(HeroService);

  protected changerHeroName($name: string) {
    this.heroModel.update((hero) => ({ ...hero, name: $name }));
  }

  protected changerHeroActif() {
    this.heroModel.update((hero) => ({ ...hero, actif: !hero.actif }));
  }

  protected onHeroChange(updatedHero: HeroInterface) {
    // Met à jour la liste des héros avec le héros modifié
    this.heroesModel.update((heroes) =>
      heroes.map((hero) => (hero.id === updatedHero.id ? updatedHero : hero)),
    );

    // Met à jour le héros sélectionné
    this.selectedHeroModel.set(updatedHero);
  }

  // Signal contenant la liste des héros
  //heroesModel = signal<HeroInterface[]>(HEROES);
  heroesModel = signal<HeroInterface[]>([]);

  // Signal contenant le héros sélectionné
  selectedHeroModel = signal<HeroInterface | null>(null);

  // Selection d'un héros
  onSelect(hero: HeroInterface): void {
    this.selectedHeroModel.set(hero);
    console.log(this.selectedHeroModel());
  }

  // Mise à jour de la liste des héros lors de l'initialisation du composant
  ngOnInit() {
    this.heroService.getHeroes().subscribe((heroes) => {
      this.heroesModel.set(heroes);
    });
  }
}
