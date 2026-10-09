/**
 * Diagnostic SANTÉ du WABA et du numéro (cause fréquente de l'erreur
 * OAuthException code 1 : WABA en ONBOARDING / can_send_message BLOCKED).
 * Usage : node test_whatsapp_health.js
 */
require('dotenv').config();
const axios = require('axios');

const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const version = (process.env.WHATSAPP_API_VERSION || 'v26.0').trim();
const api = `https://graph.facebook.com/${version}`;

// WABA propriétaire du numéro (déterminé par test_whatsapp_waba_check.js)
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '34557793653868169';

const get = async (path) => {
  try {
    const r = await axios.get(`${api}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
      validateStatus: () => true,
    });
    return { status: r.status, data: r.data };
  } catch (e) {
    return { status: 0, data: { exception: e.message } };
  }
};

(async () => {
  console.log('═══════════ ① ÉTAT DU WABA ═══════════\n');
  console.log(`WABA : ${WABA_ID}`);
  const waba = await get(`${WABA_ID}?fields=id,name,status,account_review_status,business_verification_status,health_status,currency,timezone_id`);
  console.log(JSON.stringify(waba.data, null, 2));

  console.log('\n═══════════ ② ÉTAT DU NUMÉRO EXPÉDITEUR ═══════════\n');
  console.log(`Numéro : ${phoneNumberId}`);
  const phone = await get(`${phoneNumberId}?fields=id,display_phone_number,verified_name,status,name_status,code_verification_status,quality_rating,messaging_limit_tier,platform_type,health_status,throughput`);
  console.log(JSON.stringify(phone.data, null, 2));

  console.log('\n═══════════ ③ VERDICT ═══════════\n');
  const wabaStatus = waba.data?.status;
  const wabaHealth = waba.data?.health_status || {};
  const phoneHealth = phone.data?.health_status || {};
  const canSend = phoneHealth.can_send_message || wabaHealth.can_send_message;

  console.log(`WABA status              : ${wabaStatus || 'n/a'}`);
  console.log(`WABA account_review      : ${waba.data?.account_review_status || 'n/a'}`);
  console.log(`WABA business_verif.     : ${waba.data?.business_verification_status || 'n/a'}`);
  console.log(`Numéro status            : ${phone.data?.status || 'n/a'}`);
  console.log(`Numéro code_verification : ${phone.data?.code_verification_status || 'n/a'}`);
  console.log(`messaging_limit_tier     : ${phone.data?.messaging_limit_tier || 'n/a'}`);
  console.log(`can_send_message         : ${canSend || 'n/a'}`);

  const entities = [];
  if (wabaHealth.entities) entities.push(...wabaHealth.entities);
  if (phoneHealth.entities) entities.push(...phoneHealth.entities);
  if (entities.length) {
    console.log('\nEntités signalées par Meta :');
    entities.forEach((e) => {
      const err = e.errors?.[0];
      const codeLabel = err?.error_code ? `erreur ${err.error_code}` : 'aucune erreur';
      console.log(`  - ${e.entity_type || '?'} ${e.id ? '(' + e.id + ')' : ''} → can_send_message: ${e.can_send_message || 'n/a'} | ${codeLabel}`);
      if (err?.error_description) console.log(`      ${err.error_description}`);
      if (err?.possible_solution) console.log(`      → ${err.possible_solution}`);
      (e.additional_info || []).forEach((info) => console.log(`      ℹ️  ${info}`));
    });
  } else {
    console.log('\n(Aucune entité d\'erreur signalée — bon signe)');
  }

  console.log('\n─── INTERPRÉTATION ───');
  const blocked = String(canSend || '').toUpperCase() === 'BLOCKED';
  const onboarding = String(wabaStatus || '').toUpperCase() === 'ONBOARDING';
  const codeExpired = String(phone.data?.code_verification_status || '').toUpperCase() === 'EXPIRED';

  if (blocked || onboarding) {
    console.log('🔴 CAUSE RACINE PROBABLE : le compte n\'est pas pleinement opérationnel.');
    console.log('   → can_send_message = BLOCKED et/ou WABA status = ONBOARDING.');
    console.log('   → C\'est un problème d\'ONBOARDING Meta (pas de token ni de payload) :');
    console.log('     1. developers.facebook.com → votre app → Cas d\'usage → WhatsApp → "Configuration de production"');
    console.log('        (finaliser : webhooks, enregistrement du numéro, moyen de paiement)');
    console.log('     2. business.facebook.com → WhatsApp Manager → Ajouter un moyen de paiement au WABA');
    console.log('     3. Si la boucle est bloquée (aucun bouton d\'action), contacter le support WhatsApp');
    console.log('        en fournissant l\'ID WABA + l\'ID numéro + le fbtrace_id des appels échoués.');
  } else {
    console.log('🟢 Le compte semble actif et autorisé à envoyer (can_send_message = ' + (canSend || 'n/a') + ').');
    console.log('   → La cause reste donc le token : scope whatsapp_business_messaging');
    console.log('     non rattaché au WABA ' + WABA_ID + '.');
    console.log('   → Générer un token (Utilisateur système) en sélectionnant CE WABA.');
  }
  if (codeExpired) {
    console.log('\n⚠️  code_verification_status = EXPIRED sur le numéro : re-vérifiez le numéro');
    console.log('   dans WhatsApp Manager (Paramètres du numéro → Vérifier).');
  }
})();
