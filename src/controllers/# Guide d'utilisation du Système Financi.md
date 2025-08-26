# Guide d'utilisation du Système Financier - Marketplace

## 📋 Table des matières
1. [Vue d'ensemble du système](#vue-densemble-du-système)
2. [Guide pour les Sellers](#guide-pour-les-sellers)
3. [Guide pour les Administrateurs](#guide-pour-les-administrateurs)
4. [Flux de travail complet](#flux-de-travail-complet)
5. [API Endpoints](#api-endpoints)
6. [Codes d'erreur et résolution](#codes-derreur-et-résolution)

---

## 🔍 Vue d'ensemble du système

Le système financier gère automatiquement les paiements aux sellers en fonction du cycle de vie des commandes. Il comprend :

### Entités principales :
- **Portefeuille** : Solde financier du seller
- **Transaction** : Historique de tous les mouvements d'argent
- **Retrait** : Demandes de retrait d'argent

### Statuts de transaction :
- `EN_ATTENTE` : Commande en cours de traitement
- `CONFIRME` : Commande livrée, argent disponible
- `ANNULE` : Commande annulée

### Types de solde :
- **Solde Total** : Montant total gagné
- **Solde En Attente** : Commandes pas encore livrées
- **Solde Disponible** : Montant retirable immédiatement

---

## 👨‍💼 Guide pour les Sellers

### 1. Dashboard Financier

#### Accéder à son tableau de bord financier
```http
GET /api/financial/seller/{sellerId}/dashboard?periode=30
```

**Ce que vous verrez :**
- Solde total, disponible et en attente
- Nombre de ventes ce mois
- Commissions déduites
- Retraits effectués
- Graphiques de performance (si implémenté frontend)

#### Comprendre les soldes :
```
┌─ Solde Total (10,000 FCFA) ─┐
├─ Solde Disponible (6,000)   │ ← Retirable maintenant
├─ Solde En Attente (4,000)   │ ← Commandes non livrées
└─ Retraits Total (15,000)    │ ← Déjà retiré
```

### 2. Suivi des Commandes et Gains

#### Consulter ses commandes avec détails financiers
```http
GET /api/seller/{sellerId}/orders-financial
```

**Statuts financiers des commandes :**
- 🟡 **AUCUNE** : Commande créée, pas encore prise par le livreur
- 🔵 **EN_ATTENTE** : Livreur a récupéré, argent réservé
- 🟢 **CONFIRME** : Livraison confirmée, argent disponible
- 🔴 **ANNULE** : Commande annulée, pas de paiement

### 3. Demander un Retrait

#### Étapes pour retirer son argent :

1. **Vérifier le solde disponible**
   - Seul le "Solde Disponible" peut être retiré
   - Minimum : 5,000 FCFA (configurable)

2. **Faire la demande**
   ```http
   POST /api/financial/seller/{sellerId}/retrait
   Content-Type: application/json
   
   {
     "montantDemande": 50000,
     "methodeRetrait": "MOBILE_MONEY",
     "detailsRetrait": {
       "numeroTelephone": "+22791234567",
       "operateur": "Orange Money",
       "nomBeneficiaire": "Jean Dupont"
     }
   }
   ```

3. **Suivre le statut**
   ```http
   GET /api/financial/seller/{sellerId}/retraits
   ```

#### Méthodes de retrait disponibles :
- **MOBILE_MONEY** : Orange Money, MTN Money, Moov Money
- **VIREMENT_BANCAIRE** : Vers compte bancaire
- **ESPECES** : Retrait en espèces (points de collecte)

#### Frais de retrait :
- Mobile Money : 2% (minimum 500 FCFA)
- Virement bancaire : 1,000 FCFA fixe
- Espèces : Gratuit

### 4. Consulter l'Historique

#### Voir toutes ses transactions
```http
GET /api/financial/seller/{sellerId}/transactions?page=1&limit=20&type=CREDIT_COMMANDE
```

**Types de transactions :**
- `CREDIT_COMMANDE` : Gain sur une vente
- `RETRAIT` : Retrait d'argent
- `COMMISSION` : Commission déduite
- `ANNULATION` : Remboursement d'annulation

---

## 👨‍💻 Guide pour les Administrateurs

### 1. Gestion des Commandes

#### Mettre à jour le statut d'une commande
```http
PUT /api/commandes/{commandeId}/status
Content-Type: application/json

{
  "nouvelEtat": "reçu par le livreur"
}
```

**Impact financier selon le statut :**

| Statut | Action Financière |
|--------|-------------------|
| `traitement` → `reçu par le livreur` | 💰 **Création transactions EN_ATTENTE** |
| `en cours de livraison` → `livraison reçu` | ✅ **Confirmation paiements** |
| Tout statut → `Annulée` | ❌ **Annulation transactions** |

### 2. Gestion des Retraits

#### Voir toutes les demandes de retrait
```http
GET /api/admin/retraits?statut=EN_ATTENTE&page=1
```

#### Approuver/Rejeter une demande
```http
PUT /api/admin/retraits/{retraitId}/status
Content-Type: application/json

{
  "statut": "APPROUVE",
  "commentaire": "Retrait approuvé - Paiement effectué via Orange Money"
}
```

**Workflow d'approbation :**
1. **EN_ATTENTE** : Nouvelle demande
2. **APPROUVE** : Admin approuve → Créer transaction de retrait
3. **TRAITE** : Paiement effectué
4. **REJETE** : Demande rejetée → Remettre argent dans solde disponible

### 3. Surveillance Financière

#### Dashboard global des finances
```http
GET /api/admin/financial-dashboard
```

**Métriques importantes :**
- Total des ventes par période
- Commissions collectées
- Retraits en attente
- Sellers les plus actifs
- Transactions suspectes

#### Vérifications de cohérence
```http
GET /api/admin/financial-audit
```

### 4. Configuration du Système

#### Paramètres configurables :
```javascript
const CONFIG = {
  tauxCommission: 5, // Pourcentage prélevé sur chaque vente
  montantMinimumRetrait: 5000, // FCFA
  fraisMobileMoney: 2, // Pourcentage
  fraisVirement: 1000, // FCFA fixe
  delaiConfirmation: 24, // Heures avant confirmation auto
}
```

---

## 🔄 Flux de travail complet

### Scénario : Commande de 50,000 FCFA avec 3 sellers

```
1. CLIENT passe commande
   ├─ Seller A: 20,000 FCFA (2 produits)
   ├─ Seller B: 15,000 FCFA (1 produit) 
   └─ Seller C: 15,000 FCFA (3 produits)

2. ADMIN change statut → "reçu par le livreur"
   ├─ Transaction A: 20,000 FCFA → EN_ATTENTE (Commission: 1,000)
   ├─ Transaction B: 15,000 FCFA → EN_ATTENTE (Commission: 750)
   └─ Transaction C: 15,000 FCFA → EN_ATTENTE (Commission: 750)
   
   Portefeuilles mis à jour:
   ├─ Seller A: +19,000 FCFA (soldeEnAttente)
   ├─ Seller B: +14,250 FCFA (soldeEnAttente)
   └─ Seller C: +14,250 FCFA (soldeEnAttente)

3. LIVREUR livre → ADMIN change statut → "livraison reçu"
   Tous les soldesEnAttente → soldesDisponibles

4. SELLERS peuvent maintenant retirer leur argent
```

### Cas d'annulation :
```
Si commande annulée AVANT livraison:
├─ Transactions EN_ATTENTE → ANNULE
├─ Argent retiré des portefeuilles
└─ Pas de commission prélevée

Si commande annulée APRÈS livraison:
├─ Transactions de remboursement créées
├─ Argent déduit du soldeDisponible
└─ Commission reste acquise à la plateforme
```

---

## 🔌 API Endpoints

### Endpoints Sellers

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/financial/seller/{id}/dashboard` | Dashboard financier |
| `GET` | `/api/financial/seller/{id}/transactions` | Historique transactions |
| `POST` | `/api/financial/seller/{id}/retrait` | Demander retrait |
| `GET` | `/api/financial/seller/{id}/retraits` | Mes demandes de retrait |
| `GET` | `/api/seller/{id}/orders-financial` | Commandes avec détails financiers |

### Endpoints Administrateur

| Méthode | URL | Description |
|---------|-----|-------------|
| `PUT` | `/api/commandes/{id}/status` | Mettre à jour statut commande |
| `GET` | `/api/admin/retraits` | Toutes les demandes de retrait |
| `PUT` | `/api/admin/retraits/{id}/status` | Approuver/rejeter retrait |
| `GET` | `/api/admin/financial-dashboard` | Dashboard global finances |
| `GET` | `/api/commandes/{id}/financial-details` | Détails financiers d'une commande |

---

## ⚠️ Codes d'erreur et résolution

### Erreurs communes

#### `400 - Solde insuffisant`
```json
{
  "success": false,
  "message": "Solde insuffisant",
  "details": {
    "soldeDisponible": 25000,
    "montantDemande": 30000
  }
}
```
**Solution :** Attendre que plus de commandes soient livrées

#### `400 - Montant minimum non atteint`
```json
{
  "success": false,
  "message": "Montant minimum pour retrait: 5000 FCFA"
}
```
**Solution :** Augmenter le montant demandé

#### `500 - Erreur de cohérence financière`
```json
{
  "success": false,
  "message": "Erreur lors de la transaction",
  "error": "Transaction already exists"
}
```
**Solution :** Contacter l'administrateur, possible doublon

### Actions de maintenance

#### Recalculer les soldes (Admin uniquement)
```http
POST /api/admin/recalculate-balances/{sellerId}
```

#### Forcer la confirmation des transactions (Urgence)
```http
POST /api/admin/force-confirm-transactions
```

---

## 📊 Bonnes pratiques

### Pour les Sellers :
1. **Vérifiez régulièrement** votre dashboard
2. **Retirez régulièrement** pour éviter l'accumulation
3. **Gardez vos informations de retrait à jour**
4. **Contactez l'admin** si vous voyez des incohérences

### Pour les Administrateurs :
1. **Mettez à jour les statuts rapidement** après livraison
2. **Traitez les retraits sous 48h**
3. **Surveillez les métriques financières** quotidiennement
4. **Backup de la base de données** avant modifications importantes

### Sécurité :
- Toutes les transactions sont **atomiques** (MongoDB sessions)
- **Audit trail complet** de toutes les opérations
- **Validation des montants** à chaque étape
- **Références uniques** pour éviter les doublons

---

## 🆘 Support

En cas de problème :
1. Vérifier les logs de l'application
2. Consulter la section "Codes d'erreur" ci-dessus  
3. Utiliser l'endpoint `/api/admin/financial-audit` pour diagnostiquer
4. Contacter le développeur avec les détails de l'erreur

---

*Ce guide sera mis à jour en fonction de l'évolution du système financier.*