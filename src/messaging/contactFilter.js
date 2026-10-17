/**
 * Filtre anti-contournement : les échanges restent sur la plateforme.
 * Masque numéros de téléphone, e-mails et liens externes, dans les deux sens.
 * (Protège aussi le client contre les arnaques au paiement hors plateforme.)
 */

const MASK = "•••";

// 8 chiffres ou plus, avec séparateurs possibles (+227 87 72 75 01, 87.72.75.01, 0022787727501)
// — sauf s'il s'agit visiblement d'un prix (suivi de F / FCFA / CFA / XOF)
const PHONE = /(?:\+|00)?\d(?:[\s.\-()]*\d){7,}(?!\s*(?:f\b|fcfa|cfa|xof|francs?))/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Liens : http(s)://, www., raccourcis de messageries ; nos propres liens restent autorisés
const URL = /\b(?:https?:\/\/|www\.)[^\s]+|\b(?:wa\.me|chat\.whatsapp\.com|t\.me|m\.me|bit\.ly|tinyurl\.com)\/[^\s]*/gi;
const OWN_DOMAIN = /^(?:https?:\/\/)?(?:www\.)?ihambaobab\.com(?:\/|$)/i;

function filterContacts(input) {
  const text = String(input || "");
  let masked = false;

  let out = text.replace(URL, (m) => {
    if (OWN_DOMAIN.test(m)) return m;
    masked = true;
    return MASK;
  });
  out = out.replace(EMAIL, () => { masked = true; return MASK; });
  out = out.replace(PHONE, (m, offset, whole) => {
    // Référence de commande (CMD-2026…, RET_…) : collée à un préfixe, on la garde
    if (/[A-Za-z_-]$/.test(whole.slice(0, offset))) return m;
    const digits = m.replace(/\D/g, "").replace(/^00/, "");
    const separated = /[\s.\-()]/.test(m.trim());
    const isPhone =
      digits.length === 8 ||                                   // numéro nigérien
      (digits.length === 11 && digits.startsWith("227")) ||    // +227 XXXXXXXX
      (separated && digits.length >= 9 && digits.length <= 13) || // international écrit par blocs
      (m.trim().startsWith("+") && digits.length <= 13);
    if (!isPhone) return m;
    masked = true;
    return MASK;
  });

  return { text: out, masked };
}

module.exports = { filterContacts, MASK };
