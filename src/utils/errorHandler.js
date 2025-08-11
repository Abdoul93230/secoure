const mongoose = require('mongoose');

// Wrapper pour gérer les erreurs async
const handleAsyncError = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Gestionnaire d'erreur global
const globalErrorHandler = (err, req, res, next) => {
  console.error('Erreur capturée:', err);

  // Erreur de validation Mongoose
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map(error => ({
      field: error.path,
      message: error.message
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      errors
    });
  }

  // Erreur de duplication MongoDB
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} existe déjà`,
      field
    });
  }

  // Erreur de cast MongoDB (ID invalide)
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: 'ID invalide',
      field: err.path
    });
  }

  // Erreur personnalisée
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message
    });
  }

  // Erreur serveur générique
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Classe pour les erreurs personnalisées
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Gestionnaire pour les routes non trouvées
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} non trouvée`
  });
};

module.exports = {
  handleAsyncError,
  globalErrorHandler,
  AppError,
  notFoundHandler
};