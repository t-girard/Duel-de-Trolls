export type EnemyZoneId = 'arena' | 'marais' | 'foret' | 'montagne';

export interface EnemyZone {
  id: EnemyZoneId;
  name: string;
  minLevel: number;
  maxLevel: number;
}

export const ENEMY_ZONES: EnemyZone[] = [
  { id: 'arena', name: 'Arène', minLevel: 1, maxLevel: 3 },
  { id: 'marais', name: 'Marais', minLevel: 2, maxLevel: 5 },
  { id: 'foret', name: 'Forêt', minLevel: 3, maxLevel: 7 },
  { id: 'montagne', name: 'Montagne', minLevel: 5, maxLevel: 10 },
];

export interface EnemyCatalogItem {
  name: string;
  category: string;
  zone: EnemyZoneId;
  attackPhysical: number;
  attackMagic: number;
  defensePhysical: number;
  defenseMagic: number;
  dodge: number;
  health: number;
  gold: number;
  xp: number;
}

export function parseEnemyCsv(csv: string): EnemyCatalogItem[] {
  const rows = csv.trim().replace(/^\uFEFF/, '').split(/\r?\n/);
  const headers = [
    'nom', 'categorie', 'attaque_physique', 'attaque_magique', 'defense_physique',
    'defense_magique', 'esquive', 'vie', 'or', 'xp', 'zone',
  ];
  if (rows.length < 2 || rows[0].trim() !== headers.join(',')) {
    throw new Error('Le fichier des ennemis est vide ou son en-tête est invalide.');
  }

  const enemies = rows.slice(1).map((row, index) => {
    const values = row.split(',');
    if (values.length !== headers.length || !values[0]?.trim() || !values[1]?.trim()) {
      throw new Error(`La ligne ${index + 2} du fichier des ennemis est invalide.`);
    }
    const [name, category, ...rawValues] = values;
    const zone = rawValues.pop() as string;
    if (!ENEMY_ZONES.some((entry) => entry.id === zone)) {
      throw new Error(`La zone de l’ennemi à la ligne ${index + 2} est invalide.`);
    }
    const rawStats = rawValues;
    if (rawStats.some((value) => !/^-?\d+$/.test(value))) {
      throw new Error(`Les caractéristiques de l’ennemi à la ligne ${index + 2} sont invalides.`);
    }
    const stats = rawStats.map(Number);
    if (stats.some((value) => !Number.isFinite(value))) {
      throw new Error(`Les caractéristiques de l’ennemi à la ligne ${index + 2} sont invalides.`);
    }
    const [attackPhysical, attackMagic, defensePhysical, defenseMagic, dodge, health, gold, xp] = stats;
    if (health <= 0 || gold < 0 || xp < 0) {
      throw new Error(`Les valeurs de vie, d’or ou d’expérience à la ligne ${index + 2} sont invalides.`);
    }
    return {
      name: name.trim(),
      category: category.trim(),
      zone: zone as EnemyZoneId,
      attackPhysical,
      attackMagic,
      defensePhysical,
      defenseMagic,
      dodge,
      health,
      gold,
      xp,
    };
  });
  if (!enemies.length) throw new Error('Le fichier ne contient aucun ennemi.');
  return enemies;
}
