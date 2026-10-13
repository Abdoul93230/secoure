/**
 * MOTEUR DE CALCUL DES FRAIS DE LIVRAISON — fonctions pures (aucun accès base de données).
 *
 * Entrées normalisées :
 *   zone  = { id: string, path: [{ id, type }] }   (path : de la racine jusqu'à la zone incluse)
 *   item  = { productId, quantity, unitPrice, weightKg|null, sizeClass|null }
 *   template, campaigns : objets simples (voir models/ShippingTemplate.js, ShippingCampaign.js)
 *
 * Ordre de résolution du tarif de base d'un colis (du plus prioritaire au moins prioritaire) :
 *   1. règle de destination « non desservie »          → non livrable
 *   2. règle de destination « prix fixe »               → prix imposé pour cette zone
 *   3. tarif local spécifique à une zone (areaRates)    → ex. « même quartier à Niamey : 1 000 F »
 *   4. trajet entre régions (regionRoutes)              → ex. Maradi → Niamey
 *   5. grille par relation (relations)                  → valeur générale du modèle
 *   puis + supplément de destination (surcharge) + kilos supplémentaires selon la classe de taille.
 */
const {
  RELATIONS,
  RELATION_LABELS,
  SIZE_ORDER,
  DEFAULT_WEIGHT_BY_CLASS,
  classFromWeight,
  PLATFORM_UTC_OFFSET_MINUTES,
  REASONS,
  REASON_MESSAGES,
} = require('./constants');

const LOCAL_RELATIONS = [RELATIONS.SAME_DISTRICT, RELATIONS.SAME_CITY, RELATIONS.SAME_REGION];
const TYPE_TO_RELATION = { district: RELATIONS.SAME_DISTRICT, city: RELATIONS.SAME_CITY, region: RELATIONS.SAME_REGION, country: RELATIONS.OTHER_REGION };

const str = (v) => (v == null ? '' : String(v));
const toInt = (n) => Math.max(0, Math.round(Number(n) || 0));

// ─── Relation boutique → client ──────────────────────────────────────────────

/**
 * Relation entre origine et destination, d'après le plus profond ancêtre commun.
 * Origine inconnue → autre région (prudent : on ne sous-facture jamais).
 */
function computeRelation(origin, destination) {
  if (!destination?.path?.length) return { relation: null, commonPath: [] };
  if (!origin?.path?.length) return { relation: RELATIONS.OTHER_REGION, commonPath: [], originUnknown: true };

  const commonPath = [];
  const n = Math.min(origin.path.length, destination.path.length);
  for (let i = 0; i < n; i += 1) {
    if (str(origin.path[i].id) !== str(destination.path[i].id)) break;
    commonPath.push(destination.path[i]);
  }
  if (!commonPath.length) return { relation: RELATIONS.INTERNATIONAL, commonPath };
  const deepest = commonPath[commonPath.length - 1];
  return { relation: TYPE_TO_RELATION[deepest.type] || RELATIONS.OTHER_REGION, commonPath };
}

const regionOf = (zone) => zone?.path?.find((p) => p.type === 'region') || null;

/** Règle la plus spécifique dont la zone figure dans le chemin (le plus profond d'abord) */
const deepestMatch = (rules, path, extra = () => true) => {
  if (!Array.isArray(rules) || !rules.length || !path?.length) return null;
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const id = str(path[i].id);
    const rule = rules.find((r) => str(r.zoneId) === id && extra(r));
    if (rule) return rule;
  }
  return null;
};

// ─── Poids et taille du colis ────────────────────────────────────────────────

/** Poids total et classe la plus lourde d'un colis */
function parcelWeight(items) {
  let weightKg = 0;
  let heaviest = 'small';
  for (const it of items) {
    const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
    const exact = Number(it.weightKg) > 0 ? Number(it.weightKg) : null;
    const cls = SIZE_ORDER.includes(it.sizeClass) ? it.sizeClass : exact ? classFromWeight(exact) : 'small';
    weightKg += (exact ?? DEFAULT_WEIGHT_BY_CLASS[cls]) * qty;
    if (SIZE_ORDER.indexOf(cls) > SIZE_ORDER.indexOf(heaviest)) heaviest = cls;
  }
  return { weightKg: Math.round(weightKg * 100) / 100, sizeClass: heaviest };
}

/** Kilos facturés au-delà du poids inclus (tout kilo entamé est dû) */
const billableExtraKg = (weightKg, includedKg) => Math.max(0, Math.ceil(weightKg - (Number(includedKg) || 0) - 1e-9));

// ─── Délai de livraison ──────────────────────────────────────────────────────

const parseCutoff = (hhmm = '18:30') => {
  const [h, m] = String(hhmm).split(':').map((x) => Number(x) || 0);
  return h * 60 + m;
};

/** Heure locale de la plateforme en minutes depuis minuit */
const platformMinutesOfDay = (now) => {
  const d = new Date(now);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utcMinutes + PLATFORM_UTC_OFFSET_MINUTES + 1440) % 1440;
};

const dayLabel = (min, max) => {
  if (max <= 0) return 'Aujourd’hui';
  if (min === 1 && max === 1) return 'Demain';
  if (min === max) return `${min} jours`;
  return `${min} à ${max} jours`;
};

/** Délai estimé : « le jour même » devient « demain » après l'heure limite */
function estimateDelay(delay = {}, now = new Date(), cutoff = '18:30') {
  if (delay.sameDay) {
    const late = platformMinutesOfDay(now) >= parseCutoff(cutoff);
    const d = late ? 1 : 0;
    return { minDays: d, maxDays: d, sameDay: !late, label: late ? 'Demain' : 'Aujourd’hui', cutoff };
  }
  const minDays = Math.max(0, Math.floor(Number(delay.minDays) || 1));
  const maxDays = Math.max(minDays, Math.floor(Number(delay.maxDays) || minDays));
  return { minDays, maxDays, sameDay: false, label: dayLabel(minDays, maxDays), cutoff };
}

// ─── Livraison offerte (campagnes plateforme) ────────────────────────────────

const campaignIsLive = (c, now) =>
  c?.isActive && (!c.startsAt || new Date(c.startsAt) <= now) && (!c.endsAt || new Date(c.endsAt) >= now);

/** Toutes les conditions d'une campagne sauf le montant minimum */
const campaignScopeMatches = (c, { relation, destination, sellerId }) => {
  if (Array.isArray(c.relations) && c.relations.length && !c.relations.includes(relation)) return false;
  if (Array.isArray(c.sellerIds) && c.sellerIds.length && !c.sellerIds.map(str).includes(str(sellerId))) return false;
  if (Array.isArray(c.destinationZoneIds) && c.destinationZoneIds.length) {
    const ids = (destination?.path || []).map((p) => str(p.id));
    if (!c.destinationZoneIds.map(str).some((z) => ids.includes(z))) return false;
  }
  return true;
};

/** Campagne applicable (priorité la plus haute) et « il manque X F » pour la plus proche */
function matchCampaign(campaigns, ctx, now = new Date()) {
  const live = (campaigns || []).filter((c) => campaignIsLive(c, now) && campaignScopeMatches(c, ctx));
  const eligible = live
    .filter((c) => ctx.subtotal >= (Number(c.minParcelSubtotal) || 0))
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
  if (eligible.length) return { applied: eligible[0], hint: null };
  const closest = live
    .map((c) => ({ c, remaining: (Number(c.minParcelSubtotal) || 0) - ctx.subtotal }))
    .filter((x) => x.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining)[0];
  return { applied: null, hint: closest ? { campaignId: str(closest.c._id || closest.c.id), name: closest.c.name, remaining: closest.remaining } : null };
}

// ─── Calcul d'un colis ───────────────────────────────────────────────────────

const unavailable = (base, reason) => ({
  ...base,
  deliverable: false,
  quoteRequired: reason === REASONS.QUOTE_REQUIRED || reason === REASONS.TOO_HEAVY,
  reason,
  message: REASON_MESSAGES[reason],
  fee: null,
});

/**
 * Calcule les frais d'un colis (une boutique).
 * @returns {{deliverable, quoteRequired, reason, message, fee, baseFee, extraFee, surcharge,
 *            relation, relationLabel, weightKg, sizeClass, delay, free, freeHint, breakdown, templateId}}
 */
function quoteParcel({ template, origin, destination, items, sellerId, campaigns = [], now = new Date() }) {
  const { weightKg, sizeClass } = parcelWeight(items);
  const subtotal = items.reduce((s, it) => s + (Number(it.unitPrice) || 0) * Math.max(1, Number(it.quantity) || 1), 0);
  const { relation, commonPath, originUnknown } = computeRelation(origin, destination);
  const base = {
    templateId: str(template?._id || template?.id) || null,
    relation,
    relationLabel: relation ? RELATION_LABELS[relation] : null,
    weightKg,
    sizeClass,
    subtotal,
    originUnknown: !!originUnknown,
    breakdown: [],
  };

  if (!relation) return unavailable(base, REASONS.DESTINATION_UNKNOWN);
  if (sizeClass === 'xl') return unavailable(base, REASONS.QUOTE_REQUIRED);
  if (Number(template.maxWeightKg) > 0 && weightKg > Number(template.maxWeightKg)) return unavailable(base, REASONS.TOO_HEAVY);

  // 1-2. Règles de destination (non desservie / prix fixe / supplément)
  const destRule = deepestMatch(template.destinationRules, destination.path);
  if (destRule?.mode === 'unavailable') return unavailable(base, REASONS.ZONE_UNAVAILABLE);

  const relationRule = template.relations?.[relation] || {};
  if (relation === RELATIONS.INTERNATIONAL && relationRule.available !== true) {
    return unavailable(base, REASONS.INTERNATIONAL_UNAVAILABLE);
  }
  if (relationRule.available === false) return unavailable(base, REASONS.ZONE_UNAVAILABLE);

  let baseFee = toInt(relationRule.baseFee);
  let delaySpec = relationRule.delay || {};
  let source = `Grille « ${RELATION_LABELS[relation]} »`;

  // 3. Tarif local propre à une zone (ex. même quartier à Niamey)
  if (LOCAL_RELATIONS.includes(relation)) {
    const area = deepestMatch(template.areaRates, commonPath, (r) => r.relation === relation);
    if (area) {
      baseFee = toInt(area.baseFee);
      source = `${RELATION_LABELS[relation]} — tarif local`;
    }
  }

  // 4. Trajet entre régions
  if (relation === RELATIONS.OTHER_REGION) {
    const from = str(regionOf(origin)?.id);
    const to = str(regionOf(destination)?.id);
    const route = (template.regionRoutes || []).find(
      (r) => (str(r.fromZoneId) === from && str(r.toZoneId) === to)
        || (r.bidirectional !== false && str(r.fromZoneId) === to && str(r.toZoneId) === from),
    );
    if (route) {
      baseFee = toInt(route.baseFee);
      if (route.minDays || route.maxDays) delaySpec = { minDays: route.minDays, maxDays: route.maxDays };
      source = 'Trajet entre régions';
    }
  }

  if (destRule?.mode === 'fixed') {
    baseFee = toInt(destRule.amount);
    source = 'Prix fixe pour la zone de destination';
  }
  base.breakdown.push({ label: source, amount: baseFee });

  const surcharge = destRule?.mode === 'surcharge' ? toInt(destRule.amount) : 0;
  if (surcharge) base.breakdown.push({ label: destRule.note || 'Supplément zone', amount: surcharge });

  const extraKg = billableExtraKg(weightKg, template.includedWeightKg ?? 1);
  const perKg = toInt(template.extraPerKgByClass?.[sizeClass]);
  const extraFee = extraKg * perKg;
  if (extraFee) base.breakdown.push({ label: `${extraKg} kg supplémentaire(s) × ${perKg} F`, amount: extraFee });

  let fee = baseFee + surcharge + extraFee;
  const delay = estimateDelay(delaySpec, now, template.sameDayCutoff || '18:30');

  const { applied, hint } = matchCampaign(campaigns, { relation, destination, sellerId, subtotal }, now);
  let free = null;
  if (applied) {
    free = { campaignId: str(applied._id || applied.id), name: applied.name, amount: fee };
    base.breakdown.push({ label: `Livraison offerte — ${applied.name}`, amount: -fee });
    fee = 0;
  }

  return {
    ...base,
    deliverable: true,
    quoteRequired: false,
    reason: null,
    message: null,
    fee,
    baseFee,
    surcharge,
    extraKg,
    extraFee,
    delay,
    free,
    freeHint: applied ? null : hint,
  };
}

module.exports = {
  computeRelation,
  parcelWeight,
  billableExtraKg,
  estimateDelay,
  matchCampaign,
  quoteParcel,
  platformMinutesOfDay,
};
