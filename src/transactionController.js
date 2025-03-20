const { Transaction, Commande } = require("./Models");
const { v4: uuidv4 } = require("uuid");

// Initier une transaction
exports.initiateTransaction = async (req, res) => {
  try {
    const { userId, amount, paymentMethod } = req.body;

    const transaction = new Transaction({
      transactionId: uuidv4(),
      userId,
      amount,
      paymentMethod,
      status: "en_attente",
    });

    await transaction.save();

    res.json({
      success: true,
      transactionId: transaction.transactionId,
    });
  } catch (error) {
    console.error("Erreur lors de l'initiation de la transaction:", error);
    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Une erreur est survenue lors de l'initiation de la transaction",
    });
  }
};

// Confirmer une transaction
exports.confirmTransaction = async (req, res) => {
  try {
    const { transactionId, orderId } = req.body;

    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction non trouvée",
      });
    }

    // Mettre à jour la transaction
    transaction.status = "complete";
    transaction.orderId = orderId;
    await transaction.save();

    // Mettre à jour le statut de la commande
    await Commande.findByIdAndUpdate(orderId, {
      statusPayment: "payé",
    });

    res.json({
      success: true,
      message: "Transaction confirmée avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la confirmation de la transaction:", error);
    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Une erreur est survenue lors de la confirmation de la transaction",
    });
  }
};

// Vérifier le statut d'une transaction
exports.getTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction non trouvée",
      });
    }

    res.json({
      success: true,
      status: transaction.status,
      transaction,
    });
  } catch (error) {
    console.error("Erreur lors de la vérification du statut:", error);
    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Une erreur est survenue lors de la vérification du statut",
    });
  }
};
