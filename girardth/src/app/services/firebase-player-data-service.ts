import { DestroyRef, Injectable, signal } from '@angular/core';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { Troll, TrollStat, TrollStats } from '../data/troll';
import { firebaseConfig, firebaseConfigured } from '../firebase/firebase-config';
import { MessageService } from './message-service';

const statKeys: TrollStat[] = [
  'attackPhysical', 'attackMagic', 'defensePhysical', 'defenseMagic', 'dodge', 'health',
];
const equipmentSlots = [
  'weapon', 'helmet', 'chest', 'legs', 'boots', 'gloves', 'shield', 'consumable1', 'consumable2',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function signature(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(signature).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${signature(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function parseTrolls(value: unknown): Troll[] {
  if (!Array.isArray(value)) {
    throw new Error('Les données des personnages dans Firestore ne sont pas une liste.');
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Le personnage Firestore à l’index ${index} est invalide.`);
    }

    const statsValue = entry['stats'];
    const equipmentValue = entry['equipment'];
    if (!isRecord(statsValue) || !isRecord(equipmentValue)) {
      throw new Error(`Les caractéristiques du personnage Firestore à l’index ${index} sont invalides.`);
    }
    const stats = {} as TrollStats;
    for (const stat of statKeys) {
      const amount = statsValue[stat];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 1) {
        throw new Error(`Les caractéristiques du personnage Firestore à l’index ${index} sont invalides.`);
      }
      stats[stat] = amount;
    }
    if (Object.keys(statsValue).some((key) => !statKeys.some((stat) => stat === key))) {
      throw new Error(`Les caractéristiques du personnage Firestore à l’index ${index} sont invalides.`);
    }

    const equipment: Troll['equipment'] = {};
    for (const [slot, itemId] of Object.entries(equipmentValue)) {
      if (!equipmentSlots.some((validSlot) => validSlot === slot) || typeof itemId !== 'string') {
        throw new Error(`L’équipement du personnage Firestore à l’index ${index} est invalide.`);
      }
      equipment[slot as keyof Troll['equipment']] = itemId;
    }

    const id = entry['id'];
    const level = entry['level'];
    const xp = entry['xp'];
    const gold = entry['gold'];
    const currentHealth = entry['currentHealth'];
    const marketValue = entry['market'];
    if (
      typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 ||
      typeof entry['name'] !== 'string' || !entry['name'].trim() ||
      entry['className'] !== 'Guerrier' ||
      typeof level !== 'number' || !Number.isSafeInteger(level) || level < 1 ||
      typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0 ||
      typeof gold !== 'number' || !Number.isFinite(gold) || gold < 0 ||
      (currentHealth !== undefined && (typeof currentHealth !== 'number' || !Number.isFinite(currentHealth) || currentHealth < 0)) ||
      entry['weapon'] !== 'fists' ||
      !isStringArray(entry['inventory']) ||
      typeof entry['active'] !== 'boolean'
    ) {
      throw new Error(`Le personnage Firestore à l’index ${index} ne respecte pas le schéma attendu.`);
    }

    let market: Troll['market'];
    if (marketValue !== undefined) {
      if (
        !isRecord(marketValue) ||
        typeof marketValue['date'] !== 'string' ||
        !isStringArray(marketValue['itemIds']) ||
        typeof marketValue['upgrades'] !== 'number' ||
        !Number.isSafeInteger(marketValue['upgrades']) ||
        marketValue['upgrades'] < 0 ||
        typeof marketValue['rerolls'] !== 'number' ||
        !Number.isSafeInteger(marketValue['rerolls']) ||
        marketValue['rerolls'] < 0
      ) {
        throw new Error(`Le marché du personnage Firestore à l’index ${index} est invalide.`);
      }
      market = {
        date: marketValue['date'],
        itemIds: marketValue['itemIds'],
        upgrades: marketValue['upgrades'],
        rerolls: marketValue['rerolls'],
      };
    }

    return {
      id,
      name: entry['name'],
      className: 'Guerrier',
      level,
      xp,
      gold,
      ...(typeof currentHealth === 'number' ? { currentHealth } : {}),
      stats,
      weapon: 'fists',
      inventory: entry['inventory'],
      equipment,
      ...(market ? { market } : {}),
      active: entry['active'],
    };
  });
}

@Injectable({ providedIn: 'root' })
export class FirebasePlayerDataService {
  readonly enabled = firebaseConfigured;
  readonly syncState = signal<'disabled' | 'connecting' | 'ready' | 'error'>(
    firebaseConfigured ? 'connecting' : 'disabled',
  );
  private firestoreApi?: typeof import('firebase/firestore');
  private firestore?: Firestore;
  private auth?: Auth;
  private uid?: string;
  private started = false;
  private authSubscription?: () => void;
  private playerSubscription?: () => void;
  private signingIn = false;
  private hasInitialServerSnapshot = false;
  private readonly pendingWrites = new Set<string>();

  constructor(
    private readonly messages: MessageService,
    destroyRef: DestroyRef,
  ) {
    if (!this.enabled) return;
    void this.initialize(destroyRef);
  }

  start(onSnapshot: (trolls: Troll[] | null, initial: boolean) => void): void {
    if (!this.enabled || this.started) return;
    this.started = true;
    this.onSnapshot = onSnapshot;
  }

  save(trolls: Troll[]): void {
    const api = this.firestoreApi;
    const firestore = this.firestore;
    const uid = this.uid;
    if (!api || !firestore || !uid || this.syncState() !== 'ready') return;

    const serialized = signature(trolls);
    this.pendingWrites.add(serialized);
    void api.setDoc(api.doc(firestore, 'players', uid), { trolls }, { merge: true })
      .catch((error: unknown) => {
        this.pendingWrites.delete(serialized);
        this.messages.notify(this.errorMessage(error));
      });
  }

  private onSnapshot?: (trolls: Troll[] | null, initial: boolean) => void;

  private async initialize(destroyRef: DestroyRef): Promise<void> {
    try {
      const [appApi, authApi, firestoreApi] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      if (destroyRef.destroyed) return;

      const app = appApi.getApps().length ? appApi.getApp() : appApi.initializeApp(firebaseConfig);
      this.auth = authApi.getAuth(app);
      this.firestore = firestoreApi.getFirestore(app);
      this.firestoreApi = firestoreApi;
      this.authSubscription = authApi.onAuthStateChanged(this.auth, (user: User | null) => {
        if (user) {
          this.attachPlayerDocument(user.uid);
        } else if (!this.signingIn && this.auth) {
          this.signingIn = true;
          void authApi.signInAnonymously(this.auth).catch((error: unknown) => {
            this.syncState.set('error');
            this.messages.notify(this.errorMessage(error));
          });
        }
      }, (error: Error) => {
        this.syncState.set('error');
        this.messages.notify(this.errorMessage(error));
      });
      destroyRef.onDestroy(() => {
        this.authSubscription?.();
        this.playerSubscription?.();
      });
    } catch (error) {
      this.syncState.set('error');
      this.messages.notify(this.errorMessage(error));
    }
  }

  private attachPlayerDocument(uid: string): void {
    const api = this.firestoreApi;
    const firestore = this.firestore;
    if (!api || !firestore || this.uid === uid) return;

    this.uid = uid;
    this.playerSubscription?.();
    this.playerSubscription = api.onSnapshot(
      api.doc(firestore, 'players', uid),
      (snapshot) => {
        if (snapshot.metadata.fromCache) return;
        const initial = !this.hasInitialServerSnapshot;
        this.hasInitialServerSnapshot = true;
        this.syncState.set('ready');

        if (!snapshot.exists()) {
          this.onSnapshot?.(null, initial);
          return;
        }
        try {
          const trolls = parseTrolls(snapshot.data()['trolls']);
          const serialized = signature(trolls);
          const ownWrite = this.pendingWrites.delete(serialized);
          this.onSnapshot?.(trolls, initial);
          if (!initial && !ownWrite) {
            this.messages.notify('Les personnages ont été mis à jour dans Firebase.');
          }
        } catch (error) {
          this.syncState.set('error');
          this.messages.notify(this.errorMessage(error));
        }
      },
      (error: Error) => {
        this.syncState.set('error');
        this.messages.notify(this.errorMessage(error));
      },
    );
  }

  private errorMessage(error: unknown): string {
    const detail = error instanceof Error ? error.message : 'erreur inconnue';
    return `Synchronisation des personnages avec Firebase impossible : ${detail}`;
  }
}
