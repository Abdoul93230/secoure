// Index des templates d'email pour les notifications de subscription
const subscriptionExpiringTemplate = require('./subscriptionExpiring');
const accountSuspendedTemplate = require('./accountSuspended');
const gracePeriodTemplate = require('./gracePeriod');
const subscriptionActivatedTemplate = require('./subscriptionActivated');

module.exports = {
  subscriptionExpiringTemplate,
  accountSuspendedTemplate,
  gracePeriodTemplate,
  subscriptionActivatedTemplate
};
