// Logger spécialisé pour les opérations financières
const fs = require('fs');
const path = require('path');

class FinancialLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.ensureLogDirectory();
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
    const entry = {
      timestamp,
      level,
      operation,
      data
    };
    return JSON.stringify(entry) + '\n';
  }

  log(level, operation, data) {
    try {
      const logEntry = this.formatLogEntry(level, operation, data);
      const logFile = this.getLogFileName('financial');
      
      fs.appendFileSync(logFile, logEntry);
      
      // Aussi logger dans la console avec couleurs
      const colors = {
        INFO: '\x1b[36m',    // Cyan
        WARN: '\x1b[33m',    // Jaune
        ERROR: '\x1b[31m',   // Rouge
        SUCCESS: '\x1b[32m', // Vert
        RESET: '\x1b[0m'
      };
      
      const color = colors[level] || colors.INFO;
      console.log(`${color}[${level}] ${operation}:${colors.RESET}`, data);
      
    } catch (error) {
      console.error('Erreur lors de l\'écriture du log financier:', error);
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

  // Nettoyer les anciens logs (garder 30 jours)
  cleanOldLogs(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          console.log(`Log supprimé: ${file}`);
        }
      });
    } catch (error) {
      console.error('Erreur lors du nettoyage des logs:', error);
    }
  }
}

// Instance singleton
const financialLogger = new FinancialLogger();

module.exports = financialLogger;