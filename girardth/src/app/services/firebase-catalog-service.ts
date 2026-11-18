import { DestroyRef, Injectable, signal } from '@angular/core';
import type { DocumentData, Firestore } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { EQUIPMENT, EquipmentItem, EquipmentSlot } from '../data/equipment';
import { EnemyCatalogItem, EnemyZoneId, ENEMY_ZONES } from '../data/enemy';
import { TrollStats } from '../data/troll';
import { firebaseConfig, firebaseConfigured } from '../firebase/firebase-config';
import { MessageService } from './message-service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isEquipmentCategory(value: unknown): value is EquipmentItem['category'] {
  return value === 'arme' || value === 'armure' || value === 'potion';
}

function isEquipmentSlot(value: unknown): value is EquipmentSlot | null {
  return value === null || [
    'weapon', 'helmet', 'chest', 'legs', 'boots', 'gloves', 'shield', 'consumable1', 'consumable2',
  ].some((slot) => slot === value);
}

function isAttackType(value: unknown): value is EquipmentItem['attackType'] {
  return value === null || value === 'attackPhysical' || value === 'attackMagic';
}

const equipmentStatKeys: (keyof TrollStats)[] = [
  'attackPhysical', 'attackMagic', 'defensePhysical', 'defenseMagic', 'dodge', 'health',
];

function parseEquipment(id: string, value: DocumentData): EquipmentItem {
  const data: unknown = value;
  if (
    !isRecord(data) ||
    typeof data['name'] !== 'string' ||
    !isEquipmentCategory(data['category']) ||
    typeof data['type'] !== 'string' ||
    !isStringArray(data['classes']) ||
    !isEquipmentSlot(data['slot']) ||
    !isAttackType(data['attackType']) ||
    typeof data['description'] !== 'string' ||
    typeof data['price'] !== 'number' ||
    !Number.isFinite(data['price']) ||
    typeof data['requiredLevel'] !== 'number' ||
    !Number.isInteger(data['requiredLevel']) ||
    !isRecord(data['stats'])
  ) {
    throw new Error(`L’équipement Firestore "${id}" ne respecte pas le schéma attendu.`);
  }
  const rawStats = data['stats'];
  if (Object.keys(rawStats).some((key) => !equipmentStatKeys.some((stat) => stat === key))) {
    throw new Error(`Les statistiques Firestore de l’équipement "${id}" sont invalides.`);
  }
  const stats: Partial<TrollStats> = {};
  for (const stat of equipmentStatKeys) {
    const amount = rawStats[stat];
    if (amount === undefined) continue;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new Error(`Les statistiques Firestore de l’équipement "${id}" sont invalides.`);
    }
    stats[stat] = amount;
  }

  return {
    id,
    name: data['name'],
    category: data['category'],
    type: data['type'],
    classes: data['classes'],
    slot: data['slot'],
    attackType: data['attackType'],
    stats,
    description: data['description'],
    price: data['price'],
    requiredLevel: data['requiredLevel'],
  };
}

function parseEnemy(id: string, value: DocumentData): EnemyCatalogItem {
  const data: unknown = value;
  if (
    !isRecord(data) ||
    typeof data['name'] !== 'string' ||
    typeof data['category'] !== 'string' ||
    !ENEMY_ZONES.some((zone) => zone.id === data['zone'])
  ) {
    throw new Error(`L’ennemi Firestore "${id}" ne respecte pas le schéma attendu.`);
  }
  const number = (field: string): number => {
    const value = data[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`L’ennemi Firestore "${id}" ne respecte pas le schéma attendu.`);
    }
    return value;
  };
  const attackPhysical = number('attackPhysical');
  const attackMagic = number('attackMagic');
  const defensePhysical = number('defensePhysical');
  const defenseMagic = number('defenseMagic');
  const dodge = number('dodge');
  const health = number('health');
  const gold = number('gold');
  const xp = number('xp');
  if (health <= 0 || gold < 0 || xp < 0) {
    throw new Error(`L’ennemi Firestore "${id}" ne respecte pas le schéma attendu.`);
  }
  return {
    name: data['name'],
    category: data['category'],
    zone: data['zone'] as EnemyZoneId,
    attackPhysical,
    attackMagic,
    defensePhysical,
    defenseMagic,
    dodge,
    health,
    gold,
    xp,
  };
}

@Injectable({ providedIn: 'root' })
export class FirebaseCatalogService {
  readonly firebaseEnabled = firebaseConfigured;
  readonly equipment = signal<EquipmentItem[]>(firebaseConfigured ? [] : EQUIPMENT);
  readonly enemies = signal<EnemyCatalogItem[]>([]);
  readonly equipmentLoaded = signal(false);
  readonly enemiesLoaded = signal(false);
  private firestore?: Firestore;
  private firestoreApi?: typeof import('firebase/firestore');

  constructor(
    private readonly messages: MessageService,
    destroyRef: DestroyRef,
  ) {
    if (!this.firebaseEnabled) return;
    void this.connect(destroyRef);
  }

  private async connect(destroyRef: DestroyRef): Promise<void> {
    try {
      const [appApi, firestoreApi] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
      ]);
      if (destroyRef.destroyed) return;
      const app = appApi.getApps().length ? appApi.getApp() : appApi.initializeApp(firebaseConfig);
      this.firestoreApi = firestoreApi;
      this.firestore = firestoreApi.getFirestore(app);
      const equipmentSubscription = this.observeCollection('equipment', parseEquipment)
        .subscribe({
          next: (items) => {
            this.equipment.set(items);
            this.equipmentLoaded.set(true);
          },
          error: (error: unknown) => this.messages.notify(this.errorMessage('équipement', error)),
        });
      const enemySubscription = this.observeCollection('enemies', parseEnemy)
        .subscribe({
          next: (items) => {
            this.enemies.set(items);
            this.enemiesLoaded.set(true);
          },
          error: (error: unknown) => this.messages.notify(this.errorMessage('ennemis', error)),
        });
      destroyRef.onDestroy(() => {
        equipmentSubscription.unsubscribe();
        enemySubscription.unsubscribe();
      });
    } catch (error) {
      this.messages.notify(this.errorMessage('équipement et ennemis', error));
    }
  }

  private observeCollection<T>(
    collectionName: string,
    parse: (id: string, data: DocumentData) => T,
  ): Observable<T[]> {
    return new Observable<T[]>((subscriber) => {
      const firestore = this.firestore;
      const api = this.firestoreApi;
      if (!firestore || !api) {
        subscriber.error(new Error('Firebase n’est pas configuré.'));
        return;
      }

      let receivedInitialServerSnapshot = false;
      return api.onSnapshot(
        api.collection(firestore, collectionName),
        (snapshot) => {
          try {
            const values = snapshot.docs.map((document) => parse(document.id, document.data()));
            subscriber.next(values);
            if (snapshot.metadata.fromCache) return;
            if (receivedInitialServerSnapshot && snapshot.docChanges().length > 0) {
              this.messages.notify(`Le catalogue ${collectionName === 'equipment' ? 'd’équipement' : 'des ennemis'} a été mis à jour dans Firebase.`);
            }
            receivedInitialServerSnapshot = true;
          } catch (error) {
            this.messages.notify(this.errorMessage(collectionName, error));
          }
        },
        (error: Error) => subscriber.error(error),
      );
    });
  }

  private errorMessage(collectionName: string, error: unknown): string {
    const detail = error instanceof Error ? error.message : 'erreur inconnue';
    const label = collectionName === 'equipment' ? 'équipement' : 'ennemis';
    return `Synchronisation Firebase (${label}) impossible : ${detail}`;
  }
}
