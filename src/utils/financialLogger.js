// Logger spécialisé pour les opérations financières
const fs = require('fs');
const path = require('path');

// En production : console uniquement, aucun fichier écrit sur le serveur
const FILE_LOGGING = process.env.NODE_ENV !== 'production';

class FinancialLogger {
  constructor() {
    if (FILE_LOGGING) {
      this.logDir = path.join(__dirname, '../logs');
      this.ensureLogDirectory();
    }
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFileName(type = 'financial') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${type}-${date}.log`);
  }

  formatLogEntry(level, operation, data) {
    const timestamp = new Date().toISOString();
    return JSON.stringify({ timestamp, level, operation, data }) + '\n';
  }

  log(level, operation, data) {
    const colors = {
      INFO:    '\x1b[36m',
      WARN:    '\x1b[33m',
      ERROR:   '\x1b[31m',
      SUCCESS: '\x1b[32m',
      RESET:   '\x1b[0m'
    };
    const color = colors[level] || colors.INFO;
    console.log(`${color}[${level}] ${operation}:${colors.RESET}`, data);

    if (FILE_LOGGING) {
      try {
        fs.appendFileSync(this.getLogFileName('financial'), this.formatLogEntry(level, operation, data));
      } catch (error) {
        console.error('Erreur écriture log:', error.message);
      }
    }
  }

  info(operation, data) {
    this.log('INFO', operation, data);
  }

  warn(operation, data) {
    this.log('WARN', operation, data);
  }

  error(operation, data) {
    this.log('ERROR', operation, data);
  }

  success(operation, data) {
    this.log('SUCCESS', operation, data);
  }

  // Logs spécialisés pour les opérations financières
  logTransactionCreated(transaction) {
    this.success('TRANSACTION_CREATED', {
      transactionId: transaction._id,
      sellerId: transaction.sellerId,
      commandeId: transaction.commandeId,
      type: transaction.type,
      montant: transaction.montant,
      montantNet: transaction.montantNet,
      commission: transaction.commission,
      reference: transaction.reference
    });
  }

  logTransactionStatusChanged(transactionId, ancienStatut, nouveauStatut, motif) {
    this.info('TRANSACTION_STATUS_CHANGED', {
      transactionId,
      ancienStatut,
      nouveauStatut,
      motif
    });
  }

  logPortefeuilleUpdated(sellerId, modifications, nouveauSolde) {
    this.info('PORTEFEUILLE_UPDATED', {
      sellerId,
      modifications,
      nouveauSolde
    });
  }

  logCommandeStateChanged(commandeId, ancienEtat, nouvelEtat, actionFinanciere) {
    this.info('COMMANDE_STATE_CHANGED', {
      commandeId,
      ancienEtat,
      nouvelEtat,
      actionFinanciere
    });
  }

  logIncoherence(sellerId, incoherences) {
    this.warn('INCOHERENCE_DETECTED', {
      sellerId,
      incoherences
    });
  }

  logCorrection(sellerId, corrections) {
    this.success('INCOHERENCE_CORRECTED', {
      sellerId,
      corrections
    });
  }

  // Nettoyer les anciens logs (no-op en production)
  cleanOldLogs(daysToKeep = 7) {
    if (!FILE_LOGGING) return;
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      let deleted = 0;

      files.forEach(file => {
        if (!file.endsWith('.log')) return;
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      });

      if (deleted > 0) {
        console.log(`🧹 Logs financiers: ${deleted} fichier(s) supprimé(s) (>${daysToKeep}j)`);
      }
    } catch (error) {
      console.error('Erreur lors du nettoyage des logs:', error);
    }
  }
}

// Instance singleton
const financialLogger = new FinancialLogger();

module.exports = financialLogger;