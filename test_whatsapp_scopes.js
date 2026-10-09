/**
 * Diagnostic approfondi : permissions granulaires du token vs WABA réel du numéro.
 * Usage : node test_whatsapp_scopes.js
 */
require('dotenv').config();
const axios = require('axios');

const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const version = (process.env.WHATSAPP_API_VERSION || 'v26.0').trim();
const api = `https://graph.facebook.com/${version}`;
const h = { Authorization: `Bearer ${token}` };

const get = async (url) => {
  try {
    const r = await axios.get(url, { headers: h, timeout: 15000, validateStatus: () => true });
    return { status: r.status, data: r.data };
  } catch (e) {
    return { status: 0, data: { exception: e.message } };
  }
};

(async () => {
  console.log('═══════ ① SCOPES GRANULAIRES DU TOKEN (complet) ═══════\n');
  const dbg = await get(`${api}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
  const d = dbg.data?.data || {};
  console.log(`app_id        : ${d.app_id}`);
  console.log(`type          : ${d.type}`);
  console.log(`is_valid      : ${d.is_valid}`);
  console.log(`expires_at    : ${d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'n/a'}`);
  console.log(`\nScopes granulaires de MESSAGERIE :`);
  const gs = Array.isArray(d.granular_scopes) ? d.granular_scopes : [];
  const msgScope = gs.find((g) => g.scope === 'whatsapp_business_messaging');
  const mgmtScope = gs.find((g) => g.scope === 'whatsapp_business_management');
  console.log('  whatsapp_business_messaging :', msgScope ? JSON.stringify(msgScope.target_ids || []) : '❌ ABSENT');
  console.log('  whatsapp_business_management:', mgmtScope ? JSON.stringify(mgmtScope.target_ids || []) : '❌ ABSENT');

  console.log('\n═══════ ② WABA PROPRIÉTAIRE DU NUMÉRO ═══════\n');
  const num = await get(`${api}/${phoneNumberId}?fields=display_phone_number,verified_name,account_mode`);
  console.log('Numéro :', JSON.stringify(num.data));

  const businesses = await get(`${api}/me/businesses?fields=id,name`);
  const bizList = businesses.data?.data || [];
  console.log(`\nEntreprises accessibles par ce token : ${bizList.length}`);
  bizList.forEach((b) => console.log(`  - ${b.id} : ${b.name}`));

  console.log('\nWABA par entreprise :');
  const allWabas = [];
  for (const b of bizList) {
    const wabas = await get(`${api}/${b.id}/owned_whatsapp_business_accounts?fields=id,name`);
    const list = wabas.data?.data || [];
    list.forEach((w) => { console.log(`  - ${w.id} : ${w.name} (entreprise ${b.name})`); allWabas.push(w.id); });
    if (!list.length) console.log(`  (aucun WABA pour ${b.name} — status ${wabas.status})`);
  }

  console.log('\n═══════ ③ LE NUMÉRO APPARTIENT-IL À UN WABA ACCESSIBLE ? ═══════\n');
  let ownerWaba = null;
  for (const wid of allWabas) {
    const phones = await get(`${api}/${wid}/phone_numbers?fields=id,display_phone_number,verified_name`);
    const list = phones.data?.data || [];
    list.forEach((p) => {
      const match = String(p.id) === String(phoneNumberId) ? '  ⬅ NUMÉRO CIBLÉ' : '';
      console.log(`  WABA ${wid} → ${p.id} (${p.display_phone_number})${match}`);
      if (String(p.id) === String(phoneNumberId)) ownerWaba = wid;
    });
  }

  console.log('\n═══════ ④ CONCLUSION ═══════\n');
  console.log(`WABA propriétaire du numéro   : ${ownerWaba || '❓ introuvable via ce token'}`);
  console.log(`WABAs ciblés par "messaging"  : ${msgScope ? JSON.stringify(msgScope.target_ids || []) : 'aucun'}`);
  console.log(`WABAs ciblés par "management" : ${mgmtScope ? JSON.stringify(mgmtScope.target_ids || []) : 'aucun'}`);

  const msgTargets = msgScope?.target_ids || [];
  if (ownerWaba && msgTargets.length && !msgTargets.map(String).includes(String(ownerWaba))) {
    console.log('\n🔴 CAUSE IDENTIFIÉE : le scope whatsapp_business_messaging du token NE COUVRE PAS');
    console.log(`   le WABA ${ownerWaba} qui possède le numéro → POST /messages refusé (OAuthException code 1).`);
    console.log('   → Il faut régénérer le token avec ce WABA explicitement sélectionné.');
  } else if (ownerWaba && !msgTargets.length) {
    console.log('\n🟠 Le scope messaging ne liste aucun WABA cible → le token n\'a probablement');
    console.log('   pas été autorisé avec le WABA propriétaire du numéro.');
  } else if (!ownerWaba) {
    console.log('\n🟠 Impossible de retrouver le WABA propriétaire avec ce token :');
    console.log('   le token n\'a pas accès aux assets WhatsApp de ce numéro côté Business Manager.');
  } else {
    console.log('\n🟢 Le scope messaging couvre bien le WABA du numéro → chercher côté état du numéro/app.');
  }
})();
