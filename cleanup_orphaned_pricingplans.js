require('dotenv').config();
const mongoose = require('mongoose');
const { PricingPlan } = require('./src/Models');
const SubscriptionRequest = require('./src/models/Abonnements/SubscriptionRequest');
const SubscriptionQueue = require('./src/models/Abonnements/SubscriptionQueue');

const TERMINAL_REQUEST_STATUSES = new Set(['cancelled', 'rejected']);
const ACTIVE_REQUEST_STATUSES = new Set(['pending_payment', 'payment_submitted', 'payment_verified', 'activated']);
const CANDIDATE_PLAN_STATUSES = ['queued', 'pending_activation'];

const isApplyMode = process.argv.includes('--apply');

const toId = (value) => {
  if (!value) return null;
  try {
    return value.toString();
  } catch (error) {
    return null;
  }
};

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI manquant dans les variables d\'environnement');
  }

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log(`Mode: ${isApplyMode ? 'APPLY (suppression reelle)' : 'DRY-RUN (aucune suppression)'}`);

  const [plans, requests, queues] = await Promise.all([
    PricingPlan.find({ status: { $in: CANDIDATE_PLAN_STATUSES } })
      .select('_id storeId status planType createdAt updatedAt startDate endDate queuePosition')
      .lean(),
    SubscriptionRequest.find({ linkedSubscriptionId: { $exists: true, $ne: null } })
      .select('_id status storeId linkedSubscriptionId createdAt updatedAt')
      .lean(),
    SubscriptionQueue.find({})
      .select('_id storeId queuedSubscriptions.subscriptionId')
      .lean(),
  ]);

  const activeLinkedPlanIds = new Set();
  const terminalLinkedPlanIds = new Set();

  for (const request of requests) {
    const planId = toId(request.linkedSubscriptionId);
    if (!planId) continue;

    if (ACTIVE_REQUEST_STATUSES.has(request.status)) {
      activeLinkedPlanIds.add(planId);
    }

    if (TERMINAL_REQUEST_STATUSES.has(request.status)) {
      terminalLinkedPlanIds.add(planId);
    }
  }

  const queueLinkedPlanIds = new Set();
  for (const queue of queues) {
    for (const queued of queue.queuedSubscriptions || []) {
      const planId = toId(queued.subscriptionId);
      if (planId) queueLinkedPlanIds.add(planId);
    }
  }

  const candidates = [];

  for (const plan of plans) {
    const planId = toId(plan._id);
    const reasons = [];

    if (terminalLinkedPlanIds.has(planId)) {
      reasons.push('linked_request_terminal');
    }

    const hasActiveLink = activeLinkedPlanIds.has(planId);
    const isInQueue = queueLinkedPlanIds.has(planId);
    if (!hasActiveLink && !isInQueue) {
      reasons.push('unreferenced_plan');
    }

    if (reasons.length > 0) {
      candidates.push({
        _id: plan._id,
        storeId: plan.storeId,
        status: plan.status,
        planType: plan.planType,
        reasons,
        createdAt: plan.createdAt,
      });
    }
  }

  console.log(`Plans candidats (status queued/pending_activation): ${plans.length}`);
  console.log(`Plans orphelins detectes: ${candidates.length}`);

  const preview = candidates.slice(0, 30).map((item) => ({
    id: toId(item._id),
    storeId: toId(item.storeId),
    status: item.status,
    planType: item.planType,
    reasons: item.reasons.join(','),
    createdAt: item.createdAt,
  }));

  if (preview.length > 0) {
    console.table(preview);
    if (candidates.length > preview.length) {
      console.log(`... ${candidates.length - preview.length} autres candidats non affiches`);
    }
  }

  if (!isApplyMode) {
    console.log('Dry-run termine. Relancer avec --apply pour supprimer ces plans.');
    return;
  }

  const idsToDelete = candidates.map((c) => c._id);
  if (idsToDelete.length === 0) {
    console.log('Aucun plan a supprimer.');
    return;
  }

  const deleteResult = await PricingPlan.deleteMany({
    _id: { $in: idsToDelete },
    status: { $in: CANDIDATE_PLAN_STATUSES },
  });

  const queueCleanupResult = await SubscriptionQueue.updateMany(
    { 'queuedSubscriptions.subscriptionId': { $in: idsToDelete } },
    {
      $pull: { queuedSubscriptions: { subscriptionId: { $in: idsToDelete } } },
      $set: { lastUpdated: new Date() },
    }
  );

  console.log(`Suppression pricing plans: ${deleteResult.deletedCount}`);
  console.log(`Queues mises a jour: ${queueCleanupResult.modifiedCount}`);
}

main()
  .catch((error) => {
    console.error('Erreur nettoyage pricing plans:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (error) {
      // no-op
    }
  });
