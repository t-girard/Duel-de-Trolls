import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function parseCsv(text, expectedHeaders) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error('Un champ CSV est ouvert mais n’est pas terminé.');
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);

  const headers = rows.shift()?.map((header) => header.trim());
  if (!headers || headers.join(',') !== expectedHeaders.join(',')) {
    throw new Error(`En-tête CSV invalide. En-tête attendu : ${expectedHeaders.join(',')}`);
  }
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`Ligne CSV ${index + 2} : nombre de colonnes invalide.`);
    return Object.fromEntries(headers.map((header, column) => [header, cells[column].trim()]));
  });
}

function slug(value) {
  const result = value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!result) throw new Error(`Impossible de créer un identifiant depuis "${value}".`);
  return result;
}

function numberField(row, field, line) {
  const value = Number(row[field]);
  if (!Number.isFinite(value)) throw new Error(`Ligne ${line} : valeur numérique invalide pour ${field}.`);
  return value;
}

const existingEquipmentIds = new Map([
  ['gourdasse-en-bois-brut', 'gourdasse-bois'],
  ['epee-rouillee-de-maraudeur', 'epee-rouillee'],
  ['hache-de-fendeur-de-cranes', 'hache-fendeur'],
  ['espadon-en-pierre-taillee', 'espadon-pierre'],
  ['calotte-de-fer-brut', 'calotte-fer'],
  ['casque-a-cornes-de-guerre', 'casque-cornes'],
  ['plastron-de-cuir-cloute', 'plastron-cuir'],
  ['plastron-en-plaques-de-fer', 'plastron-fer'],
  ['jambieres-de-cuir-durci', 'jambieres-cuir'],
  ['bottes-ferrees-de-fantassin', 'bottes-fer'],
  ['gantelets-en-fer-forge', 'gantelets-fer'],
  ['bouclier-en-bois-et-metal', 'bouclier-bois-metal'],
  ['potion-de-force-brute', 'potion-force'],
  ['potion-de-carapace-de-pierre', 'potion-carapace'],
  ['infusion-de-vigueur-troll', 'infusion-vigueur'],
]);

function importEquipment(rows) {
  const slots = {
    casque: 'helmet',
    plastron: 'chest',
    jambières: 'legs',
    bottes: 'boots',
    gants: 'gloves',
    bouclier: 'shield',
  };
  const usedIds = new Set();
  return rows.map((row, index) => {
    const line = index + 2;
    const nameSlug = slug(row.nom);
    const id = existingEquipmentIds.get(nameSlug) ?? nameSlug;
    if (usedIds.has(id)) throw new Error(`Ligne ${line} : identifiant d’équipement dupliqué "${id}".`);
    usedIds.add(id);
    if (!['arme', 'armure', 'potion'].includes(row.categorie)) {
      throw new Error(`Ligne ${line} : catégorie d’équipement inconnue "${row.categorie}".`);
    }

    const stats = Object.fromEntries([
      ['attackPhysical', 'attaque_physique'],
      ['attackMagic', 'attaque_magique'],
      ['defensePhysical', 'defense_physique'],
      ['defenseMagic', 'defense_magique'],
      ['dodge', 'esquive'],
      ['health', 'vie'],
    ].map(([field, csvField]) => [field, numberField(row, csvField, line)]).filter(([, amount]) => amount !== 0));
    const attackPhysical = numberField(row, 'attaque_physique', line);
    const attackMagic = numberField(row, 'attaque_magique', line);
    const defensePhysical = numberField(row, 'defense_physique', line);
    const defenseMagic = numberField(row, 'defense_magique', line);
    const dodge = numberField(row, 'esquive', line);
    const health = numberField(row, 'vie', line);
    const offense = Math.max(attackPhysical, attackMagic);
    const defense = defensePhysical + defenseMagic;
    const price = row.categorie === 'arme'
      ? 250 + offense * 100
      : row.categorie === 'armure'
        ? 250 + defense * 80 + health * 10 + Math.abs(dodge) * 25
        : 250 + Math.max(attackPhysical, attackMagic, defensePhysical, defenseMagic, Math.abs(dodge), health) * 100;
    const requirementScore = row.categorie === 'arme' ? offense : defense + Math.ceil(health / 5);
    const className = row.classe.trim().toLowerCase();
    if (!className) throw new Error(`Ligne ${line} : classe manquante.`);

    return {
      id,
      name: row.nom,
      category: row.categorie,
      type: row.type,
      classes: [className === 'toutes' ? 'toutes' : `${className[0].toUpperCase()}${className.slice(1)}`],
      slot: row.categorie === 'arme' ? 'weapon' : row.categorie === 'potion' ? null : slots[row.type.toLowerCase()] ?? null,
      attackType: row.type_attaque === 'physique'
        ? 'attackPhysical'
        : row.type_attaque === 'magique'
          ? 'attackMagic'
          : null,
      stats,
      description: row.description,
      price,
      requiredLevel: Math.max(1, Math.ceil(requirementScore / 5)),
    };
  });
}

function importEnemies(rows) {
  const usedIds = new Set();
  const zones = new Set(['arena', 'marais', 'foret', 'montagne']);
  return rows.map((row, index) => {
    const line = index + 2;
    const id = slug(row.nom);
    if (usedIds.has(id)) throw new Error(`Ligne ${line} : identifiant d’ennemi dupliqué "${id}".`);
    usedIds.add(id);
    if (!zones.has(row.zone)) throw new Error(`Ligne ${line} : zone inconnue "${row.zone}".`);
    const enemy = {
      name: row.nom,
      category: row.categorie,
      zone: row.zone,
      attackPhysical: numberField(row, 'attaque_physique', line),
      attackMagic: numberField(row, 'attaque_magique', line),
      defensePhysical: numberField(row, 'defense_physique', line),
      defenseMagic: numberField(row, 'defense_magique', line),
      dodge: numberField(row, 'esquive', line),
      health: numberField(row, 'vie', line),
      gold: numberField(row, 'or', line),
      xp: numberField(row, 'xp', line),
    };
    if (enemy.health <= 0 || enemy.gold < 0 || enemy.xp < 0) {
      throw new Error(`Ligne ${line} : vie, or et xp doivent être des valeurs valides.`);
    }
    return { id, ...enemy };
  });
}

async function writeCollection(db, collectionName, documents) {
  for (let offset = 0; offset < documents.length; offset += 500) {
    const batch = db.batch();
    for (const { id, ...data } of documents.slice(offset, offset + 500)) {
      batch.set(db.collection(collectionName).doc(id), data);
    }
    await batch.commit();
  }
}

const [equipmentCsv, enemiesCsv] = await Promise.all([
  readFile(resolve('src/equipements.csv'), 'utf8'),
  readFile(resolve('src/ennemis.csv'), 'utf8'),
]);
const equipment = importEquipment(parseCsv(equipmentCsv, [
  'nom', 'categorie', 'type', 'classe', 'type_attaque', 'attaque_physique',
  'attaque_magique', 'defense_physique', 'defense_magique', 'esquive', 'vie', 'description',
]));
const enemies = importEnemies(parseCsv(enemiesCsv, [
  'nom', 'categorie', 'attaque_physique', 'attaque_magique', 'defense_physique',
  'defense_magique', 'esquive', 'vie', 'or', 'xp', 'zone',
]));

if (process.argv.includes('--dry-run')) {
  console.log(`Validation réussie : ${equipment.length} équipements, ${enemies.length} ennemis. Aucune écriture effectuée.`);
  process.exit(0);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error('Définir FIREBASE_PROJECT_ID avant de lancer l’import.');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('Définir GOOGLE_APPLICATION_CREDENTIALS vers une clé Admin conservée hors du dépôt.');
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
await writeCollection(db, 'equipment', equipment);
await writeCollection(db, 'enemies', enemies);
console.log(`Import terminé : ${equipment.length} équipements, ${enemies.length} ennemis dans ${projectId}.`);
