/**
 * Diagnostic WhatsApp Cloud API — identifie précisément l'origine d'une erreur
 * OAuthException / token invalide.
 * Usage : node test_whatsapp_diag.js
 */
require('dotenv').config();
const axios = require('axios');

const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const version = (process.env.WHATSAPP_API_VERSION || 'v26.0').trim();
const api = `https://graph.facebook.com/${version}`;

console.log('════════════════════ DIAGNOSTIC WHATSAPP ════════════════════\n');
console.log(`Version API      : ${version}`);
console.log(`Phone number ID  : ${phoneNumberId}`);
console.log(`Longueur token   : ${token.length}`);
console.log(`Token commence   : ${token.slice(0, 12)}...`);
console.log(`Token finit      : ...${token.slice(-6)}`);
console.log(`Espaces/retours  : ${/[^\x21-\x7e]/.test(token) ? '⚠️ CARACTÈRES INVALIDES DÉTECTÉS' : 'aucun (OK)'}`);
console.log('');

const get = async (url, label) => {
  try {
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000, validateStatus: () => true });
    console.log(`── ${label} → HTTP ${r.status}`);
    console.log(JSON.stringify(r.data, null, 2).slice(0, 1500));
    console.log('');
    return r.data;
  } catch (e) {
    console.log(`── ${label} → EXCEPTION: ${e.message}\n`);
    return null;
  }
};

(async () => {
  // 1) Le token est-il valide ? (debug_token)
  console.log('① Vérification du token (debug_token)\n');
  await get(`${api}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`, 'debug_token');

  // 2) Informations sur le numéro expéditeur
  console.log('② Informations sur le numéro expéditeur\n');
  await get(`${api}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,platform_type`, `GET /${phoneNumberId}`);

  // 3) Templates disponibles (nom + catégorie + langue)
  console.log('③ Templates du compte WhatsApp Business\n');
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (wabaId) {
    await get(`${api}/${wabaId}/message_templates?fields=name,status,language,category&limit=20`, 'message_templates');
  } else {
    console.log('   (WHATSAPP_BUSINESS_ACCOUNT_ID non défini dans .env — étape ignorée)\n');
  }

  // 4) Test de version alternative
  console.log('④ Test avec v25.0 (version de votre curl manuel)\n');
  try {
    const r = await axios.get(`https://graph.facebook.com/v25.0/${phoneNumberId}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 15000, validateStatus: () => true,
    });
    console.log(`   v25.0 → HTTP ${r.status} : ${JSON.stringify(r.data).slice(0, 300)}\n`);
  } catch (e) {
    console.log(`   v25.0 → EXCEPTION: ${e.message}\n`);
  }

  console.log('══════════════════════════════════════════════════════════════');
  console.log('INTERPRÉTATION :');
  console.log('- HTTP 200 sur debug_token → token valide (vérifier expires_at et scopes)');
  console.log('- OAuthException code 190/1 → token expiré, révoqué ou app différente');
  console.log('- HTTP 400 "Unsupported get request" sur le numéro → ID expéditeur/mode app');
  console.log('══════════════════════════════════════════════════════════════');
})();
