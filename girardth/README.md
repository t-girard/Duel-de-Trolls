# Duel de Trolls

Jeu de trolls réalisé avec Angular. Les catalogues d’équipement et d’ennemis ainsi que les personnages et leur progression sont synchronisés depuis Cloud Firestore quand Firebase est configuré.

## Développement

Prérequis : Node.js 22.22.3+ ou 24.15.0+, npm 11.

```bash
npm install
npm start
```

L’application est ensuite disponible sur `http://localhost:4200/`. Pour compiler et lancer les tests :

```bash
npm run build
npm test
```

## Configurer Firebase

1. Créer un projet Firebase et une application Web depuis la console Firebase. Créer une base Cloud Firestore en mode production.
2. Copier la configuration Web dans `src/app/firebase/firebase-config.ts` (`apiKey`, `authDomain`, `projectId`, `appId`). Cette configuration identifie le projet ; elle ne constitue pas un secret ni un contrôle d’accès.
3. Dans **Authentication → Sign-in method**, active le fournisseur **Anonyme**. L’application utilise cette authentification pour donner à chaque navigateur un identifiant Firebase et protéger ses personnages.
4. Publier les règles du fichier `firestore.rules` dans la console Firebase. Les collections `equipment` et `enemies` sont lisibles publiquement, mais aucune écriture cliente n’est autorisée. Chaque utilisateur ne peut lire et modifier que son document dans `players/{uid}`. Toute autre collection reste interdite par défaut.
5. Importer les catalogues comme décrit ci-dessous, puis lancer l’application. Sans configuration Web complète, l’application conserve le catalogue d’équipement local, charge les ennemis depuis `src/ennemis.csv` et garde les personnages dans `localStorage`.

Au premier lancement Firebase, si aucun document personnel n’existe, les personnages présents dans `localStorage` sont importés dans Firestore. Si le document Firebase existe déjà, il devient la source de vérité et remplace les données locales. L’authentification anonyme permet de retrouver les données dans le même profil de navigateur ; effacer les données du navigateur ou changer d’appareil crée un nouvel utilisateur anonyme. Une connexion avec un compte est nécessaire pour retrouver le même profil sur plusieurs appareils.

### Synchronisation et notifications

`FirebaseCatalogService` utilise le SDK Firebase Web modulaire et un listener Firestore `onSnapshot` par collection. Les résultats validés sont exposés par des Angular Signals et consommés par le marché, l’inventaire et l’arène. Le premier état reçu ne déclenche pas de toast ; les changements ultérieurs de documents affichent une notification globale pendant quelques secondes. Les erreurs de lecture ou de validation sont également signalées.

La synchronisation des catalogues est unidirectionnelle : les clients les observent, mais ne les modifient pas. Les personnages sont lus et enregistrés en temps réel dans un document propre à l’utilisateur, sécurisé par les règles Firestore. Les changements de catalogues doivent être réalisés par un administrateur dans la console ou par l’importeur ci-dessous.

### Zones et niveaux des ennemis

L’arène propose quatre zones : Arène (niveaux 1–3), Marais (2–5), Forêt (3–7) et Montagne (5–10). Chaque ligne de `src/ennemis.csv` précise sa zone ; seules les créatures de cette zone peuvent être sélectionnées. Un niveau aléatoire dans l’intervalle de la zone multiplie toutes les caractéristiques de base de l’ennemi, y compris les points de vie et l’esquive. L’or et l’expérience de victoire sont également multipliés par ce niveau. Ces mêmes récompenses d’expérience s’appliquent en cas de défaite.

Après l’ajout de la colonne `zone`, réimporte les catalogues (`npm run import:catalogs`) pour ajouter cette information aux ennemis déjà présents dans Firestore. Sans Firebase, la même donnée est lue depuis le CSV local.

### Importer les fichiers CSV

L’importeur utilise `firebase-admin` uniquement côté Node.js, jamais dans le bundle Angular. Il importe `src/equipements.csv` vers `equipment` et `src/ennemis.csv` vers `enemies`. Les identifiants de document sont des slugs dérivés des noms ; les 15 équipements déjà utilisés par les sauvegardes locales conservent leurs identifiants existants. L’import met à jour/crée les documents correspondants, sans effacer les anciens documents qui ne figureraient plus dans les CSV : les suppressions se font explicitement dans Firestore.

Créer une clé de compte de service dans les paramètres du projet Firebase et la conserver en dehors du dépôt. Puis définir les variables d’environnement et lancer :

```bash
export FIREBASE_PROJECT_ID="identifiant-du-projet"
export GOOGLE_APPLICATION_CREDENTIALS="/chemin/hors-du-depot/cle-admin.json"
npm run import:catalogs
```

Pour valider les fichiers et le schéma sans accès Firebase ni écriture, lancer `npm run import:catalogs -- --dry-run`. L’importeur valide les colonnes attendues et les valeurs numériques avant l’écriture. Les CSV d’équipement n’ont pas de prix ni de niveau requis : l’importeur les calcule de manière déterministe. Pour une arme, le prix est `250 + 100 × max(attaque physique, attaque magique)` ; pour une armure, `250 + 80 × (défense physique + défense magique) + 10 × vie + 25 × |esquive|` ; pour une potion, `250 + 100 × meilleure valeur absolue de caractéristique`. Le niveau requis vaut au moins 1 et correspond au plafond du score d’attaque d’une arme ou du score défense + vie/5 d’une armure, divisé par 5. Les potions requièrent le niveau 1. Ces valeurs complètent les données existantes et peuvent être ajustées directement dans Firestore.

### Schéma Firestore

- `equipment/{slug}` : `name`, `category` (`arme`, `armure`, `potion`), `type`, `classes` (tableau), `slot`, `attackType`, `stats` (bonus non nuls), `description`, `price`, `requiredLevel`.
- `enemies/{slug}` : `name`, `category`, `zone` (`arena`, `marais`, `foret`, `montagne`), `attackPhysical`, `attackMagic`, `defensePhysical`, `defenseMagic`, `dodge`, `health`, `gold`, `xp`.
- `players/{uid}` : `trolls`, un tableau contenant les personnages, leurs caractéristiques, leur inventaire, leur équipement, leur progression et leurs points de vie actuels (`currentHealth`).

L’application valide ces champs lors de chaque mise à jour en temps réel ; les documents mal formés sont signalés et ne remplacent pas le dernier catalogue valide.

## Choix techniques

- Le SDK Web Firebase modulaire limite le code client aux API nécessaires et utilise `onSnapshot` pour réagir sans rafraîchissement.
- Les données Firestore sont converties en Signals Angular pour rendre les changements réactifs dans les composants et services existants.
- Un service global de messages affiche les changements et erreurs sous forme de toasts. Le premier snapshot ne produit pas de notification afin d’éviter un message au démarrage.
- Le SDK Admin est réservé à un import local explicite. La clé de service ne doit jamais être ajoutée au dépôt ni livrée au navigateur.
- Les règles Firestore limitent l’application aux lectures publiques des deux catalogues et interdisent les écritures clientes. Cette configuration convient à des catalogues publics ; un projet nécessitant des données confidentielles doit ajouter une authentification et des règles adaptées.
- `localStorage` reste utilisé comme sauvegarde locale et pour importer les personnages existants lors de la première connexion Firebase ; ensuite le document Firestore de l’utilisateur devient la source de vérité.
- L’authentification anonyme évite de rendre les personnages publics ou modifiables par d’autres utilisateurs sans imposer de formulaire de connexion. Elle ne permet toutefois pas à elle seule une restauration sur un autre appareil.
- Les points de vie actuels sont enregistrés avec le personnage, et régénèrent un point toutes les cinq secondes hors combat ; ils ne sont pas restaurés automatiquement à l’entrée dans une nouvelle bataille.
- Les achats d’armes et d’armures se font chez le forgeron ; les potions sont proposées séparément par l’alchimiste.
- Le niveau, la progression d’expérience et les points de compétence disponibles du personnage actif sont visibles dans la barre de navigation.
- Les caractéristiques ont une couleur dédiée pour faciliter leur lecture : attaques vertes, défenses grises, santé rouge et esquive bleue.

## Tests

Les tests unitaires Angular sont dans `src/app/tests/`. Les lancer avec `npm test`.
