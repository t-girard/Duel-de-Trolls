import { HeroDetailComponent } from './components/hero-detail-component/hero-detail-component';
import { ArenaComponent } from './components/arena/arena';
import { LeaderboardComponent } from './components/leaderboard/leaderboard';
import { MarketComponent } from './components/market/market';
import { AlchemistComponent } from './components/alchemist/alchemist';
import { PlayerProfileComponent } from './components/player-profile/player-profile';
import { NewTrollComponent } from './components/new-troll/new-troll';
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/personnage', pathMatch: 'full' },
  { path: 'dashboard', redirectTo: '/personnage', pathMatch: 'full' },
  { path: 'personnages', redirectTo: '/profil', pathMatch: 'full' },
  { path: 'profil', component: PlayerProfileComponent },
  { path: 'nouveau-troll', component: NewTrollComponent },
  { path: 'personnage', component: HeroDetailComponent },
  { path: 'personnage/:id', component: HeroDetailComponent },
  { path: 'leaderboard', component: LeaderboardComponent },
  { path: 'arene', component: ArenaComponent },
  { path: 'forgeron', component: MarketComponent },
  { path: 'marche', redirectTo: '/forgeron', pathMatch: 'full' },
  { path: 'alchimiste', component: AlchemistComponent },
  { path: 'heroes', redirectTo: '/personnage' },
  { path: '**', redirectTo: '/personnage' },
];
