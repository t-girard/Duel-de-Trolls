import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TrollService } from '../../services/troll-service';

@Component({
  selector: 'app-leaderboard',
  imports: [RouterLink],
  templateUrl: './leaderboard.html',
})
export class LeaderboardComponent {
  private readonly trollService = inject(TrollService);
  readonly topTrolls = computed(() =>
    [...this.trollService.trolls()]
      .sort((first, second) => second.level - first.level || second.xp - first.xp)
      .slice(0, 5),
  );
}
