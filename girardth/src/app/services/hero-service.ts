import { inject, Injectable } from '@angular/core';
import { HeroInterface } from '../data/heroInterface';
import { HEROES } from '../data/mock-heroes';
import { Observable, of } from 'rxjs';
import { MessageService } from './message-service';
@Injectable({
  providedIn: 'root',
})
export class HeroService {
  private heroes: HeroInterface[] = HEROES;
  private messageService = inject(MessageService);

  getHeroes(): Observable<HeroInterface[]> {
    //return of(this.heroes);
    return new Observable((observer) => {
      observer.next(HEROES.slice(0, 1));
      this.messageService.add('HeroService : 1 premier héros récupéré');

      setTimeout(() => {
        observer.next(HEROES);
        this.messageService.add('HeroService : tous les héros récupérés avec succès');
        observer.complete();
      }, 2000);
    });
  }

  // Méthode pour récupérer un héros précis par son ID
  getHero(id: number): Observable<HeroInterface | undefined> {
    const hero = this.heroes.find((h) => h.id === id);
    this.messageService.add(`HeroService : héros id=${id} récupéré`);
    return of(hero);
  }
}
