/**
 * Test d'envoi OTP WhatsApp — script de validation
 *
 * Usage :
 *   node test_whatsapp_otp.js                 → envoie au numéro par défaut (22787727501)
 *   node test_whatsapp_otp.js 22790000000     → envoie au numéro passé en argument
 *   node test_whatsapp_otp.js --dry           → affiche seulement la config + le payload (n'envoie RIEN)
 *
 * ⚠️ Nécessite la config WHATSAPP_* dans .env + un destinataire autorisé
 *    (numéro de test Meta approuvé si l'app est en mode développement).
 */
require('dotenv').config();
const whatsapp = require('./src/services/whatsappOtpService');

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const phoneArg = args.find((a) => !a.startsWith('--'));
const recipient = phoneArg || '22787727501';
const code = String(Math.floor(100000 + Math.random() * 900000));

console.log('═══════════════════════════════════════════════════════');
console.log('TEST OTP WHATSAPP — IhamBaobab');
console.log('═══════════════════════════════════════════════════════\n');

console.log('📋 Configuration détectée :');
console.table(whatsapp.getConfigSummary());

console.log(`\n📞 Destinataire : ${recipient}`);
console.log(`🔑 Code OTP généré : ${code}\n`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (isDry) {
    console.log('🧪 Mode --dry : aucun envoi réel effectué.');
    console.log('Payload qui aurait été envoyé :');
    console.log(JSON.stringify({
      messaging_product: 'whatsapp',
      to: whatsapp.normalizeRecipient(recipient),
      type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME || '(template)',
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'fr' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          {
            type: 'button', sub_type: 'url', index: '0',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
    }, null, 2));
    process.exit(0);
  }

  try {
    console.log('🚀 Envoi en cours...');
    const result = await whatsapp.sendOtp(recipient, code, 10);

    console.log('\n✅ ENVOI RÉUSSI');
    console.log(`   messageId    : ${result.messageId}`);
    console.log(`   statut API   : ${result.messageStatus}`);
    console.log(`   template     : ${result.template}`);
    console.log(`   destinataire : ${result.recipient}`);
    console.log('\n📦 Réponse brute Meta :');
    console.log(JSON.stringify(result.raw, null, 2));

    if (result.messageId) {
      console.log('\n⏳ Vérification du statut de livraison dans 8 s...');
      await wait(8000);
      try {
        const status = await whatsapp.getMessageStatus(result.messageId);
        console.log('📊 Statut du message :', JSON.stringify(status, null, 2));
      } catch (statusErr) {
        console.log('⚠️  Impossible de lire le statut :', whatsapp.getErrorMessage(statusErr));
      }
    }

    console.log('\n👉 Vérifiez maintenant le WhatsApp du numéro ' + recipient + ' — le code à saisir est : ' + code);
    process.exit(0);
  } catch (err) {
    console.log('\n❌ ÉCHEC DE L\'ENVOI');
    console.log(`   message : ${whatsapp.getErrorMessage(err)}`);
    console.log(`   code    : ${err.code || '(aucun)'}`);
    if (err.providerBody) {
      console.log('\n📦 Réponse brute Meta :');
      console.log(JSON.stringify(err.providerBody, null, 2));
    } else {
      console.log(`   détail  : ${err.message}`);
    }
    process.exit(1);
  }
})();
