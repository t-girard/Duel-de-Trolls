import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  maxHealth,
  Troll,
  TrollStat,
} from '../../data/troll';
import { EquipmentItem, equipmentBonus, equipmentItem, effectiveStat } from '../../data/equipment';
import { ENEMY_ZONES, EnemyCatalogItem, EnemyZoneId, parseEnemyCsv } from '../../data/enemy';
import { FirebaseCatalogService } from '../../services/firebase-catalog-service';
import { TrollService } from '../../services/troll-service';

interface Enemy {
  name: string;
  category: string;
  zone: EnemyZoneId;
  level: number;
  hp: number;
  maxHp: number;
  attackPhysical: number;
  attackMagic: number;
  defensePhysical: number;
  defenseMagic: number;
  dodge: number;
  gold: number;
  xp: number;
}

type PlayerAction = 'attack' | 'defend' | 'flee';
type BattleRewards = { xp: number; gold: number };

@Component({
  selector: 'app-arena',
  imports: [RouterLink],
  templateUrl: './arena.html',
})
export class ArenaComponent {
  readonly service = inject(TrollService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly catalog = inject(FirebaseCatalogService);
  readonly fighter = signal<Troll | null>(null);
  readonly enemy = signal<Enemy | null>(null);
  readonly playerHp = signal(0);
  readonly enemyHp = signal(0);
  readonly log = signal<string[]>([]);
  readonly result = signal<'victory' | 'defeat' | 'fled' | null>(null);
  readonly turn = signal(0);
  readonly rewards = signal<BattleRewards | null>(null);
  readonly loadingEnemy = signal(false);
  readonly arenaError = signal<string | null>(null);
  readonly zones = ENEMY_ZONES;
  readonly selectedZone = signal<EnemyZoneId>('arena');
  readonly selectedZoneInfo = computed(() =>
    this.zones.find((zone) => zone.id === this.selectedZone())!,
  );
  readonly equippedWeapon = computed<EquipmentItem | undefined>(() =>
    equipmentItem(this.fighter()?.equipment.weapon, this.catalog.equipment()),
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      const trollId = this.fighter()?.id;
      if (trollId !== undefined) this.service.endCombat(trollId);
    });
  }

  async startFight(): Promise<void> {
    const troll = this.service.activeTroll();
    if (!troll) return;
    if (this.service.currentHealth(troll) <= 0) {
      this.arenaError.set('Ton troll doit récupérer au moins 1 point de vie avant de combattre.');
      return;
    }
    if (this.loadingEnemy()) return;
    this.loadingEnemy.set(true);
    this.arenaError.set(null);
    try {
      let baseEnemies: EnemyCatalogItem[];
      if (this.catalog.firebaseEnabled) {
        if (!this.catalog.enemiesLoaded()) {
          this.arenaError.set('Le catalogue des ennemis Firebase n’est pas encore chargé.');
          return;
        }
        baseEnemies = this.catalog.enemies();
      } else {
        const enemyFileUrl = new URL('assets/ennemis.csv', document.baseURI);
        const response = await fetch(enemyFileUrl);
        if (!response.ok) {
          this.arenaError.set(`Chargement du fichier des ennemis impossible (${response.status}).`);
          return;
        }
        baseEnemies = parseEnemyCsv(await response.text());
      }
      const zone = this.zones.find((entry) => entry.id === this.selectedZone())!;
      const eligibleEnemies = baseEnemies.filter((entry) => entry.zone === zone.id);
      if (!eligibleEnemies.length) {
        this.arenaError.set(`Aucun ennemi n’est disponible dans la zone ${zone.name}.`);
        return;
      }
      const baseEnemy = eligibleEnemies[Math.floor(Math.random() * eligibleEnemies.length)];
      const level = zone.minLevel + Math.floor(Math.random() * (zone.maxLevel - zone.minLevel + 1));
      const enemy = this.scaleEnemy(baseEnemy, level);
      this.fighter.set({ ...troll, stats: { ...troll.stats } });
      this.enemy.set(enemy);
      this.service.beginCombat(troll.id);
      this.playerHp.set(this.service.currentHealth(troll));
      this.enemyHp.set(enemy.maxHp);
      this.turn.set(0);
      this.result.set(null);
      this.rewards.set(null);
      this.log.set([`${troll.name} affronte ${enemy.name} (niveau ${enemy.level}) dans la zone ${zone.name}.`]);
    } catch (error) {
      this.arenaError.set(error instanceof Error ? error.message : 'Impossible de charger un adversaire.');
    } finally {
      this.loadingEnemy.set(false);
    }
  }

  private scaleEnemy(enemy: EnemyCatalogItem, level: number): Enemy {
    const health = enemy.health * level;
    return {
      name: enemy.name,
      category: enemy.category,
      zone: enemy.zone,
      level,
      attackPhysical: enemy.attackPhysical * level,
      attackMagic: enemy.attackMagic * level,
      defensePhysical: enemy.defensePhysical * level,
      defenseMagic: enemy.defenseMagic * level,
      dodge: enemy.dodge * level,
      hp: health,
      maxHp: health,
      gold: enemy.gold * level,
      xp: enemy.xp * level,
    };
  }

  takeTurn(action: PlayerAction): void {
    const fighter = this.fighter();
    const enemy = this.enemy();
    if (!fighter || !enemy || this.result()) return;

    if (action === 'flee') {
      this.log.update((entries) => [`${fighter.name} quitte la zone sans récompense.`, ...entries]);
      this.result.set('fled');
      this.service.endCombat(fighter.id);
      return;
    }

    this.turn.update((turn) => turn + 1);
    const events: string[] = [`Tour ${this.turn()}.`];
    let nextEnemyHp = this.enemyHp();
    let nextPlayerHp = this.playerHp();

    if (action === 'attack') {
      const equippedWeapon = this.equippedWeapon();
      const attackType = equippedWeapon?.attackType ?? 'attackPhysical';
      const enemyDefends = Math.random() < 0.2;
      const enemyDefense = attackType === 'attackPhysical'
        ? enemy.defensePhysical
        : enemy.defenseMagic;
      const attack = effectiveStat(fighter, attackType, this.catalog.equipment());
      const hit = this.calculateHit(attack, enemy.dodge, enemyDefends ? enemyDefense : 0);
      if (hit.dodged) {
        events.push(`${enemy.name} esquive l’attaque de ${fighter.name}.`);
      } else {
        nextEnemyHp = Math.max(0, nextEnemyHp - hit.damage);
        events.push(`${fighter.name} inflige ${hit.damage} dégâts${hit.critical ? ' (coup critique !)' : ''}.`);
        if (enemyDefends) events.push(`${enemy.name} avait choisi de se défendre.`);
      }
    } else {
      events.push(`${fighter.name} se met en garde.`);
    }

    const enemyAttackType: 'attackMagic' | 'attackPhysical' = enemy.attackMagic > enemy.attackPhysical
      ? 'attackMagic'
      : 'attackPhysical';
    const enemyDefenseStat: TrollStat = enemyAttackType === 'attackMagic'
      ? 'defenseMagic'
      : 'defensePhysical';
    const enemyAttack = enemy[enemyAttackType];
    const defenseStat: TrollStat = action === 'defend'
      ? enemyDefenseStat
      : 'defensePhysical';
    const defense = action === 'defend' ? effectiveStat(fighter, defenseStat, this.catalog.equipment()) : 0;
    const incoming = this.calculateHit(enemyAttack, effectiveStat(fighter, 'dodge', this.catalog.equipment()), defense);
    if (incoming.dodged) {
      events.push(`${fighter.name} esquive l’attaque ennemie.`);
    } else {
      nextPlayerHp = Math.max(0, nextPlayerHp - incoming.damage);
      events.push(`${enemy.name} inflige ${incoming.damage} dégâts ${enemyAttackType === 'attackMagic' ? 'magiques' : 'physiques'}${incoming.critical ? ' (coup critique !)' : ''}.`);
    }

    this.enemyHp.set(nextEnemyHp);
    this.playerHp.set(nextPlayerHp);
    this.service.setCurrentHealth(fighter.id, nextPlayerHp);
    this.enemy.update((current) => current ? { ...current, hp: nextEnemyHp } : current);
    this.log.update((entries) => [...events.reverse(), ...entries].slice(0, 12));

    if (nextPlayerHp <= 0) {
      this.finishDefeat(fighter, enemy);
    } else if (nextEnemyHp <= 0) {
      this.finishVictory(fighter, enemy);
    }
  }

  healthPercent(current: number, maximum: number): number {
    return maximum > 0 ? Math.max(0, (current / maximum) * 100) : 0;
  }

  playerMaxHealth(): number {
    const fighter = this.fighter();
    return fighter ? maxHealth(fighter, equipmentBonus(fighter, 'health', this.catalog.equipment())) : 1;
  }

  equippedConsumable(slot: 'consumable1' | 'consumable2'): EquipmentItem | undefined {
    const troll = this.service.trolls().find((entry) => entry.id === this.fighter()?.id);
    return equipmentItem(troll?.equipment[slot], this.catalog.equipment());
  }

  useConsumable(slot: 'consumable1' | 'consumable2'): void {
    const fighter = this.fighter();
    if (!fighter || !this.enemy() || this.result()) return;
    const item = this.service.consumeEquipment(fighter.id, slot);
    if (!item) return;

    const stats = { ...fighter.stats };
    for (const stat of Object.keys(item.stats) as TrollStat[]) {
      stats[stat] = Math.max(1, stats[stat] + (item.stats[stat] ?? 0));
    }
    this.fighter.update((current) => current ? { ...current, stats } : current);
    const healthBonus = item.stats.health ?? 0;
    if (healthBonus > 0) {
      this.playerHp.update((health) => health + healthBonus * 5);
      this.service.setCurrentHealth(fighter.id, this.playerHp());
    }
    this.log.update((entries) => [`${item.name} utilisé : ses bonus durent jusqu’à la fin du combat.`, ...entries]);
  }

  private calculateHit(attack: number, dodge: number, defense: number): {
    dodged: boolean;
    damage: number;
    critical: boolean;
  } {
    if (Math.random() < Math.min(0.5, dodge / 100)) {
      return { dodged: true, damage: 0, critical: false };
    }
    const critical = Math.random() < 0.1;
    const multiplier = critical ? 2 : 0.75 + Math.random() * 0.5;
    const damage = Math.max(1, Math.floor(Math.max(1, attack - defense) * multiplier));
    return { dodged: false, damage, critical };
  }

  private finishVictory(fighter: Troll, enemy: Enemy): void {
    this.service.endCombat(fighter.id);
    const xp = enemy.xp;
    const gold = enemy.gold;
    const levels = this.service.awardVictory(fighter.id, xp, gold);
    this.rewards.set({ xp, gold });
    const levelMessage = levels ? ` ${fighter.name} gagne ${levels} niveau(x) et 2 points de compétence par niveau.` : '';
    this.log.update((entries) => [`Victoire ! +${xp} XP et +${gold} or.${levelMessage}`, ...entries]);
    this.result.set('victory');
  }

  private finishDefeat(fighter: Troll, enemy: Enemy): void {
    this.service.endCombat(fighter.id);
    const xp = Math.round(enemy.xp * 0.01);
    const goldLost = Math.floor(fighter.gold * 0.1);
    const levels = this.service.awardDefeat(fighter.id, xp, goldLost);
    this.rewards.set({ xp, gold: -goldLost });
    const levelMessage = levels ? ` ${fighter.name} gagne ${levels} niveau(x) et 2 points de compétence par niveau.` : '';
    this.log.update((entries) => [`Défaite. +${xp} XP (1 % de la récompense), mais ${goldLost} or sont perdus.${levelMessage}`, ...entries]);
    this.result.set('defeat');
  }
}
