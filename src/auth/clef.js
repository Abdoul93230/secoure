/**
 * Clé de signature des jetons des clients.
 * SÉCURITÉ : à définir dans .env (USER_JWT_SECRET, 64 caractères aléatoires minimum).
 * L'ancienne valeur publique ne reste qu'en repli de transition : la changer déconnecte tout le monde une fois.
 */
const LEGACY = "CUSTOM_PRIVATe_KEY";
const key = process.env.USER_JWT_SECRET || LEGACY;
if (key === LEGACY && process.env.NODE_ENV === "production") {
  console.warn("[SÉCURITÉ] USER_JWT_SECRET absent : clé de signature publique utilisée. Ajoutez-la dans .env.");
}
module.exports = key;
