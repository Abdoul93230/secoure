# 🚀 Migration du Système de Commission

Ce dossier contient tous les scripts nécessaires pour migrer votre système existant vers la nouvelle logique de commission basée sur les abonnements.

## 📋 Nouveau Système de Tarification

| Plan | Prix mensuel | Taux de commission |
|------|-------------|-------------------|
| **Starter** | 1,000 FCFA | 4% |
| **Pro** | 2,500 FCFA | 3% |
| **Business** | 5,000 FCFA | 2.5% |

## 📁 Fichiers du Projet

### Scripts Principaux
- `run-migration.js` - **Script principal** pour orchestrer la migration
- `migrate-commission-system.js` - Logic de migration des données
- `backup-before-migration.js` - Création de sauvegardes automatiques

### Scripts de Test
- `test-commission-system.js` - Test des taux de commission
- `test-seller-subscriptions.js` - Test d'intégration avec MongoDB

### Configuration
- `subscriptionConfig.js` - Configuration des plans d'abonnement

## 🚀 Guide d'Utilisation

### Option 1: Migration Complète (Recommandée)
```bash
# Exécute tout: sauvegarde → migration → tests
node run-migration.js complete
```

### Option 2: Étape par Étape
```bash
# 1. Créer une sauvegarde d'abord
node run-migration.js backup

# 2. Exécuter la migration
node run-migration.js migrate

# 3. Tester le système
node run-migration.js test
```

### Option 3: Actions Individuelles
```bash
# Sauvegarde seulement
node backup-before-migration.js

# Migration seulement  
node migrate-commission-system.js

# Tests seulement
node test-commission-system.js

# Rollback en cas de problème
node migrate-commission-system.js --rollback
```

## ⚠️ Précautions Importantes

### Avant la Migration
1. **Sauvegarde automatique** - Le script crée une sauvegarde complète
2. **Environnement de test** - Testez d'abord sur une copie de votre DB
3. **Maintenance** - Informez vos utilisateurs d'une brève maintenance

### Pendant la Migration
- ⏱️ La migration peut prendre quelques minutes selon la taille de votre DB
- 🔒 Ne pas interrompre le processus une fois commencé
- 📊 Surveillez les logs pour détecter d'éventuelles erreurs

### Après la Migration
- ✅ Vérifiez l'interface `SellerFinancialDashboard`
- 💰 Testez quelques transactions
- 📈 Contrôlez les nouveaux calculs de commission

## 🔧 Ce que Fait la Migration

### 1. Création des Plans d'Abonnement (PricingPlan)
- Crée des plans d'abonnement dans la collection `pricingplans` pour les sellers qui n'en ont pas
- Utilise le modèle `PricingPlan` existant avec les champs appropriés
- Assigne automatiquement le plan "Starter" par défaut avec 30 jours d'essai
- Lie les sellers à leurs plans via le champ `subscriptionId`

### 2. Recalcul des Transactions avec Intégration PricingPlan
- Met à jour toutes les transactions de commission existantes
- Utilise le modèle `PricingPlan` pour déterminer le taux de commission correct
- Applique les nouveaux taux selon l'abonnement actuel du seller
- Fallback vers le champ `subscription` du seller si le plan n'est pas trouvé
- Garde une trace de l'ancien taux pour audit

### 3. Synchronisation des Portefeuilles avec Nouveaux Calculs
- Recalcule tous les soldes selon les nouveaux taux de commission
- Met à jour les montants disponibles en tenant compte des plans d'abonnement
- Conserve la cohérence financière entre transactions et portefeuilles

### 4. Intégration API et Interface
- Ajoute de nouvelles routes API pour récupérer les informations de plan
- Met à jour l'interface `SellerFinancialDashboard` pour afficher le plan actuel
- Intègre l'affichage du taux de commission basé sur le `PricingPlan`

## 🔄 Rollback et Récupération

### Rollback Automatique
```bash
node migrate-commission-system.js --rollback
```

### Restauration Manuelle
Si vous avez une sauvegarde:
```bash
cd backup_commission_[timestamp]
node restore.js
```

## 📊 Validation Post-Migration

### Vérifications Automatiques
Le script vérifie automatiquement:
- ✅ Cohérence des montants de commission
- ✅ Intégrité des portefeuilles  
- ✅ Correspondance seller ↔ abonnement
- ✅ Calculs mathématiques corrects

### Vérifications Manuelles
1. **Interface Seller**: Vérifiez que le plan et le taux s'affichent
2. **Nouvelles Commandes**: Testez une vente pour confirmer le taux
3. **Historique**: Contrôlez quelques transactions migrées

## 🆘 Résolution de Problèmes

### Erreurs Communes

**Connexion MongoDB**
```
❌ Erreur: connexion refusée
→ Vérifiez votre MONGODB_URI
→ Contrôlez votre connexion internet
```

**Seller non trouvé**
```
❌ Seller non trouvé pour transaction XXX  
→ Normal, transaction sera ignorée
→ Pas d'impact sur les autres données
```

**Différence de montants**
```
⚠️ Écart détecté dans les calculs
→ Vérifiez les logs de migration
→ Utilisez le rollback si nécessaire
```

### Support
En cas de problème:
1. 📋 Copiez les logs d'erreur complets
2. 🔄 Tentez un rollback d'abord
3. 💾 Utilisez la sauvegarde automatique si nécessaire

## 📈 Monitoring Post-Migration

### Métriques à Surveiller
- 💰 **Revenus de commission** par plan d'abonnement
- 📊 **Répartition des sellers** par plan  
- 🔄 **Taux de conversion** vers les plans payants
- ⚡ **Performance** du nouveau système

### Optimisations Futures
- 🎯 Ajustement des taux selon les performances
- 🚀 Nouvelles fonctionnalités par plan
- 📱 Interface d'upgrade d'abonnement
- 💎 Plans premium additionnels

---

**🎉 Bonne migration !** 

Ce nouveau système vous permettra de:
- 💸 Optimiser vos revenus de commission
- 🎯 Encourager les upgrades d'abonnement  
- 📈 Suivre les performances par plan
- 🚀 Faire évoluer votre modèle économique