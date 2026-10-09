/**
 * Vérifie quel WABA possède le numéro expéditeur (1236743262857951)
 * à partir des WABA accessibles en gestion par le token courant.
 * Usage : node test_whatsapp_waba_check.js
 */
require('dotenv').config();
const axios = require('axios');

const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const version = (process.env.WHATSAPP_API_VERSION || 'v26.0').trim();
const api = `https://graph.facebook.com/${version}`;

// WABA ciblés par le scope whatsapp_business_management du token
const candidateWabas = ['34557793653868169', '4426239887696699'];

const get = async (url) => {
  try {
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000, validateStatus: () => true });
    return { status: r.status, data: r.data };
  } catch (e) {
    return { status: 0, data: { exception: e.message } };
  }
};

(async () => {
  console.log(`Numéro cible : ${phoneNumberId}\n`);
  let owner = null;
  let ownerSubscribedCount = 0;

  for (const wid of candidateWabas) {
    const info = await get(`${api}/${wid}?fields=id,name,account_review_status,owner_business_info`);
    const phones = await get(`${api}/${wid}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`);
    const subs = await get(`${api}/${wid}/subscribed_apps`);

    console.log(`── WABA ${wid}`);
    console.log(`   infos : ${JSON.stringify(info.data).slice(0, 260)}`);
    const apps = subs.data?.data || [];
    console.log(`   apps abonnées (webhooks) : ${apps.length ? apps.map((a) => `${a.whatsapp_business_api_data?.id || a.id} (${a.whatsapp_business_api_data?.name || 'sans nom'})`).join(', ') : 'aucune'}`);
    const list = phones.data?.data || [];
    if (!list.length) {
      console.log(`   numéros : (aucun accessible — ${JSON.stringify(phones.data).slice(0, 200)})`);
    } else {
      list.forEach((p) => {
        const isTarget = String(p.id) === String(phoneNumberId);
        if (isTarget) { owner = wid; ownerSubscribedCount = apps.length; }
        console.log(`   numéro : ${p.id} | ${p.display_phone_number} | ${p.verified_name} | code: ${p.code_verification_status || 'n/a'}${isTarget ? '   ⬅ NUMÉRO CIBLÉ' : ''}`);
      });
    }
    console.log('');
  }

  console.log('═══════ CONCLUSION ═══════');
  if (owner) {
    console.log(`✅ Le numéro ${phoneNumberId} appartient au WABA : ${owner}`);
    if (!ownerSubscribedCount) {
      console.log('🔴 AUCUNE application n\'est rattachée à ce WABA.');
      console.log('   → C\'est la cause de l\'erreur OAuthException code 1 : l\'app du token');
      console.log('     n\'a pas accès au WABA propriétaire du numéro pour la messagerie.');
      console.log('   → Actions : (1) rattacher votre app au WABA dans WhatsApp Manager,');
      console.log('     (2) générer un token avec whatsapp_business_messaging sur CE WABA');
      console.log('     (Utilisateur système recommandé), (3) relancer test_whatsapp_otp.js');
    } else {
      console.log('   → Le token doit recevoir whatsapp_business_messaging SUR CE WABA précis.');
    }
    console.log(`   → WABA à sélectionner lors de la génération du token : ${owner}`);
  } else {
    console.log('❓ Le numéro n\'est accessible via aucun des WABA listés par ce token.');
    console.log('   → Le token n\'a pas les droits sur le WABA propriétaire.');
  }
})();
