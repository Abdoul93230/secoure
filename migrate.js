#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  SCRIPT DE MIGRATION IHAMBAOBAB                                      ║
 * ║  MongoDB  : ancien cluster → nouveau cluster                         ║
 * ║  Cloudinary: ancien cloud (dkfddtykk) → nouveau cloud (drjxb4v5t)   ║
 * ║                                                                      ║
 * ║  Seuls les fichiers référencés en DB sont migrés.                    ║
 * ║  Les autres ressources de l'ancien cloud sont ignorées.              ║
 * ║                                                                      ║
 * ║  Usage: node migrate.js [options]                                    ║
 * ║    --dry-run           Simule sans rien écrire                       ║
 * ║    --skip-cloudinary   Ne migre pas les images (DB seulement)        ║
 * ║    --skip-env          Ne met pas à jour le .env à la fin            ║
 * ║    --force             Réécrit les docs déjà dans la nouvelle DB     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// ─── Arguments CLI ─────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const DRY_RUN         = ARGS.includes('--dry-run');
const SKIP_CLOUDINARY = ARGS.includes('--skip-cloudinary');
const SKIP_ENV        = ARGS.includes('--skip-env');
const FORCE           = ARGS.includes('--force');

// ─── Credentials ───────────────────────────────────────────────────────────────
const OLD_MONGO_URI = 'mongodb+srv://abdoulrazak9323:qrru0xfJGmJG0TSc@cluster0.mvrgous.mongodb.net/?retryWrites=true&w=majority';
const NEW_MONGO_URI = 'mongodb+srv://ihambaobab_db_user:fFTSEYa7y2gZmH4K@ihambaobabcluster.rucr9hc.mongodb.net/?retryWrites=true&w=majority';

const OLD_CLOUD_NAME = 'dkfddtykk';
const OLD_CLOUD_DOMAIN = `res.cloudinary.com/${OLD_CLOUD_NAME}`;

const NEW_CLOUD_CONFIG = {
  cloud_name: 'drjxb4v5t',
  api_key:    '373429179689279',
  api_secret: 'iYGUtrI9dMQiDJVdh808nmUmwmM',
};

const NEW_FOLDER = 'ihambaobab';

// ─── Fichier de cache (résumable) ──────────────────────────────────────────────
const CACHE_FILE  = path.join(__dirname, '.migration_cache.json');
const REPORT_FILE = path.join(__dirname, '.migration_report.json');

const urlCache  = new Map(); // old URL → new URL
const failedUrls = new Set();

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      Object.entries(data.urls || {}).forEach(([k, v]) => urlCache.set(k, v));
      (data.failed || []).forEach(u => failedUrls.add(u));
      console.log(`  📋 Cache chargé : ${urlCache.size} URLs déjà migrées, ${failedUrls.size} échecs connus`);
    } catch { /* fichier corrompu, on repart de zéro */ }
  }
}

function saveCache() {
  const obj = { urls: {}, failed: [...failedUrls] };
  urlCache.forEach((v, k) => { obj.urls[k] = v; });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
}

// ─── Cloudinary : upload depuis une URL publique ───────────────────────────────
let cloudinaryReady = false;

function initCloudinary() {
  cloudinary.config(NEW_CLOUD_CONFIG);
  cloudinaryReady = true;
}

async function migrateUrl(oldUrl) {
  if (!oldUrl || typeof oldUrl !== 'string') return oldUrl;
  if (!oldUrl.includes(OLD_CLOUD_DOMAIN)) return oldUrl; // pas notre cloud

  if (urlCache.has(oldUrl)) return urlCache.get(oldUrl);
  if (failedUrls.has(oldUrl)) return oldUrl; // déjà échoué, on garde l'ancienne URL

  if (DRY_RUN || SKIP_CLOUDINARY) {
    // En dry-run, simule une nouvelle URL
    const fake = oldUrl.replace(OLD_CLOUD_DOMAIN, `res.cloudinary.com/${NEW_CLOUD_CONFIG.cloud_name}`);
    urlCache.set(oldUrl, fake);
    return fake;
  }

  try {
    await sleep(400); // respect des limites de l'API
    const result = await cloudinary.uploader.upload(oldUrl, {
      resource_type: 'auto',
      folder: NEW_FOLDER,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });
    const newUrl = result.secure_url;
    urlCache.set(oldUrl, newUrl);
    saveCache();
    return newUrl;
  } catch (err) {
    console.warn(`    ⚠️  Upload échoué [${oldUrl.slice(0, 70)}...] : ${err.message}`);
    failedUrls.add(oldUrl);
    saveCache();
    return oldUrl; // conserve l'ancienne URL si échec
  }
}

// ─── Deep-scan d'un document BSON / JS ────────────────────────────────────────
async function processDoc(value) {
  if (value === null || value === undefined) return value;

  // Types BSON et primitifs non-string → inchangés
  if (typeof value === 'number'  ) return value;
  if (typeof value === 'boolean' ) return value;
  if (value instanceof Date      ) return value;
  if (Buffer.isBuffer(value)     ) return value;
  if (value._bsontype            ) return value; // ObjectId, Decimal128, etc.

  if (typeof value === 'string') {
    return await migrateUrl(value);
  }

  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(await processDoc(item));
    return out;
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = await processDoc(v);
    }
    return out;
  }

  return value;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function bar(done, total, width = 30) {
  const pct = total === 0 ? 1 : done / total;
  const filled = Math.round(pct * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${done}/${total}`;
}

// ─── Migration principale ──────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   IHAMBAOBAB — Migration MongoDB + Cloudinary ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  if (DRY_RUN)         console.log('🔍  MODE DRY-RUN — aucune donnée ne sera écrite\n');
  if (SKIP_CLOUDINARY) console.log('⏭️   Images Cloudinary ignorées\n');

  loadCache();

  if (!SKIP_CLOUDINARY && !DRY_RUN) initCloudinary();

  // ── Connexions MongoDB ───────────────────────────────────────────────────────
  console.log('🔄 Connexion aux deux clusters MongoDB...');
  const mongoOptions = {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
  };

  const oldConn = await mongoose.createConnection(OLD_MONGO_URI, mongoOptions).asPromise();
  console.log('  ✅ Ancien cluster connecté');

  const newConn = await mongoose.createConnection(NEW_MONGO_URI, mongoOptions).asPromise();
  console.log('  ✅ Nouveau cluster connecté\n');

  // ── Liste des collections ────────────────────────────────────────────────────
  const allCollections = await oldConn.db.listCollections().toArray();
  const collections = allCollections
    .map(c => c.name)
    .filter(name => !name.startsWith('system.'));

  console.log(`📦 ${collections.length} collections à migrer :\n   ${collections.join(', ')}\n`);

  // ── Rapport ──────────────────────────────────────────────────────────────────
  const report = {
    startedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    collections: {},
    cloudinary: { migrated: 0, failed: 0, skipped: 0 },
  };

  // ── Migration collection par collection ──────────────────────────────────────
  const BATCH_SIZE = 50;

  for (const collName of collections) {
    const oldColl = oldConn.db.collection(collName);
    const newColl = newConn.db.collection(collName);

    const total = await oldColl.countDocuments();
    console.log(`\n📂 ${collName} — ${total} documents`);

    if (total === 0) {
      report.collections[collName] = { total: 0, migrated: 0, skipped: 0, urlsReplaced: 0 };
      continue;
    }

    let migrated = 0, skipped = 0, urlsReplaced = 0;
    let skip = 0;

    while (skip < total) {
      const docs = await oldColl.find({}).skip(skip).limit(BATCH_SIZE).toArray();
      if (docs.length === 0) break;

      for (const doc of docs) {
        // Vérifier si déjà dans la nouvelle DB (sauf --force)
        if (!FORCE) {
          const exists = await newColl.findOne({ _id: doc._id }, { projection: { _id: 1 } });
          if (exists) {
            skipped++;
            skip++;
            continue;
          }
        }

        // Détecter si le doc contient des URLs Cloudinary
        const docStr = JSON.stringify(doc);
        const hasOldUrls = docStr.includes(OLD_CLOUD_DOMAIN);

        let processedDoc = doc;
        if (hasOldUrls) {
          processedDoc = await processDoc(doc);
          // Compter les remplacements
          const newStr = JSON.stringify(processedDoc);
          const countOld = (docStr.match(new RegExp(OLD_CLOUD_DOMAIN.replace(/\./g, '\\.'), 'g')) || []).length;
          urlsReplaced += countOld;
        }

        if (!DRY_RUN) {
          await newColl.replaceOne(
            { _id: processedDoc._id },
            processedDoc,
            { upsert: true }
          );
        }
        migrated++;
      }

      skip += docs.length;
      process.stdout.write(`\r  ${bar(Math.min(skip, total), total)} ${skipped > 0 ? `(${skipped} ignorés)` : ''}`);
    }

    process.stdout.write('\n');
    console.log(`  ✅ ${migrated} migrés | ${skipped} déjà présents | ${urlsReplaced} URLs Cloudinary remplacées`);
    report.collections[collName] = { total, migrated, skipped, urlsReplaced };
  }

  // ── Rapport Cloudinary ───────────────────────────────────────────────────────
  report.cloudinary.migrated = urlCache.size;
  report.cloudinary.failed   = failedUrls.size;

  // ── Mise à jour du .env ──────────────────────────────────────────────────────
  const ENV_FILE = path.join(__dirname, '.env');
  if (!SKIP_ENV && !DRY_RUN) {
    console.log('\n📝 Mise à jour du fichier .env...');
    let envContent = fs.readFileSync(ENV_FILE, 'utf8');

    // MongoDB URI
    envContent = envContent.replace(
      /^(#\s*)?MONGODB_URI\s*=.*$/gm,
      (line) => line.startsWith('#') ? line : `# ${line.trim()}`
    );
    if (!envContent.includes(NEW_MONGO_URI)) {
      envContent += `\nMONGODB_URI = ${NEW_MONGO_URI}\n`;
    }

    // Cloudinary
    envContent = envContent.replace(
      /^(#\s*)?CLOUDINARY_CLOUD_NAME\s*=.*$/gm,
      (line) => line.startsWith('#') ? line : `# ${line.trim()}`
    );
    envContent = envContent.replace(
      /^(#\s*)?CLOUDINARY_API_KEY\s*=.*$/gm,
      (line) => line.startsWith('#') ? line : `# ${line.trim()}`
    );
    envContent = envContent.replace(
      /^(#\s*)?CLOUDINARY_API_SECRET\s*=.*$/gm,
      (line) => line.startsWith('#') ? line : `# ${line.trim()}`
    );

    envContent += `\n# Nouveau cloud Ihambaobab\nCLOUDINARY_CLOUD_NAME= ${NEW_CLOUD_CONFIG.cloud_name}\nCLOUDINARY_API_KEY= ${NEW_CLOUD_CONFIG.api_key}\nCLOUDINARY_API_SECRET= ${NEW_CLOUD_CONFIG.api_secret}\n`;

    fs.writeFileSync(ENV_FILE, envContent);
    console.log('  ✅ .env mis à jour');
  }

  // ── Rapport final ────────────────────────────────────────────────────────────
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   MIGRATION TERMINÉE                          ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n  Collections migrées : ${Object.keys(report.collections).length}`);
  const totalDocs = Object.values(report.collections).reduce((s, c) => s + c.migrated, 0);
  const totalUrls = Object.values(report.collections).reduce((s, c) => s + c.urlsReplaced, 0);
  console.log(`  Documents migrés    : ${totalDocs}`);
  console.log(`  URLs remplacées     : ${totalUrls}`);
  console.log(`  Images uploadées    : ${report.cloudinary.migrated}`);
  if (report.cloudinary.failed > 0) {
    console.log(`  ⚠️  Images échouées  : ${report.cloudinary.failed} (URLs anciennes conservées)`);
  }
  console.log(`\n  Rapport complet     : ${REPORT_FILE}`);

  if (failedUrls.size > 0) {
    console.log('\n⚠️  URLs échouées (à vérifier manuellement) :');
    [...failedUrls].slice(0, 10).forEach(u => console.log(`   - ${u}`));
    if (failedUrls.size > 10) console.log(`   ... et ${failedUrls.size - 10} autres (voir .migration_cache.json)`);
  }

  await oldConn.close();
  await newConn.close();
  console.log('\n🔌 Connexions fermées\n');
}

main().catch(err => {
  console.error('\n❌ ERREUR FATALE :', err.message);
  console.error(err.stack);
  process.exit(1);
});
