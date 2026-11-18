import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MessageManager } from './components/message-manager-component/message-manager';
import { FirebaseCatalogService } from './services/firebase-catalog-service';
import { TrollService } from './services/troll-service';
import { maxStatPoints, totalStatPoints, xpForNextLevel } from './data/troll';

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MessageManager],
})
export class App {
  protected readonly title = 'Duel de Trolls';
  private readonly firebaseCatalog = inject(FirebaseCatalogService);
  readonly trollService = inject(TrollService);
  readonly xpForNextLevel = xpForNextLevel;

  xpProgress(level: number, xp: number): number {
    return Math.min(100, (xp / xpForNextLevel(level)) * 100);
  }

  skillPointsRemaining(): number {
    const troll = this.trollService.activeTroll();
    return troll ? maxStatPoints(troll.level) - totalStatPoints(troll.stats) : 0;
  }
}
