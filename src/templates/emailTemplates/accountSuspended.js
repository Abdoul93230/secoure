const accountSuspendedTemplate = (storeName, suspensionDate, planType, reactivationLink) => {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Votre compte a été suspendu</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
                line-height: 1.6;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                background: white;
                border-radius: 10px;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #e74c3c, #c0392b);
                color: white;
                padding: 30px 20px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 600;
            }
            .content {
                padding: 30px;
            }
            .suspension-box {
                background: #ffebee;
                border: 2px solid #f44336;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                text-align: center;
            }
            .suspension-icon {
                font-size: 48px;
                color: #e74c3c;
                margin-bottom: 10px;
            }
            .plan-info {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
            }
            .plan-info h3 {
                margin: 0 0 10px 0;
                color: #2c3e50;
            }
            .reactivation-button {
                display: inline-block;
                background: linear-gradient(135deg, #27ae60, #2ecc71);
                color: white !important;
                text-decoration: none;
                padding: 15px 30px;
                border-radius: 8px;
                font-weight: 600;
                margin: 20px 0;
                text-align: center;
                transition: transform 0.2s;
            }
            .reactivation-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(39,174,96,0.3);
            }
            .footer {
                background: #2c3e50;
                color: white;
                padding: 20px;
                text-align: center;
                font-size: 14px;
            }
            .urgent {
                color: #e74c3c;
                font-weight: bold;
            }
            .info-box {
                background: #e8f4fd;
                border-left: 4px solid #3498db;
                padding: 15px;
                margin: 20px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚫 Compte Suspendu</h1>
                <p>Votre boutique IhamBaobab a été suspendue</p>
            </div>
            
            <div class="content">
                <p>Bonjour <strong>${storeName}</strong>,</p>
                
                <div class="suspension-box">
                    <div class="suspension-icon">⛔</div>
                    <h2 class="urgent">Votre compte a été suspendu</h2>
                    <p>Date de suspension : ${new Date(suspensionDate).toLocaleDateString('fr-FR')} à ${new Date(suspensionDate).toLocaleTimeString('fr-FR')}</p>
                </div>
                
                <div class="plan-info">
                    <h3>📦 Plan expiré : ${planType}</h3>
                    <p>Votre abonnement a expiré et la période de grâce de 48 heures est maintenant terminée.</p>
                </div>
                
                <h3>🔒 Conséquences de la suspension :</h3>
                <ul>
                    <li><strong>❌ Votre boutique n'est plus accessible aux clients</strong></li>
                    <li><strong>❌ Vos produits ne sont plus visibles</strong></li>
                    <li><strong>❌ Les commandes sont bloquées</strong></li>
                    <li><strong>❌ Votre tableau de bord est limité</strong></li>
                </ul>
                
                <div class="info-box">
                    <h4>💾 Vos données sont protégées</h4>
                    <p>Rassurez-vous, toutes vos données (produits, commandes, clients) sont sauvegardées et seront restaurées dès la réactivation de votre compte.</p>
                </div>
                
                <h3>🔄 Comment réactiver votre compte ?</h3>
                <ol>
                    <li>Choisissez un nouveau plan d'abonnement</li>
                    <li>Effectuez le paiement</li>
                    <li>Votre boutique sera réactivée dans les plus brefs délais</li>
                </ol>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${reactivationLink}" class="reactivation-button">
                        ⚡ Réactiver mon compte
                    </a>
                </div>
                
                <div class="info-box">
                    <h4>💡 Évitez les futures suspensions</h4>
                    <p>Optez pour l'abonnement annuel avec un rappel automatique 30 jours avant expiration. Vous économiserez 20% et éviterez les interruptions de service.</p>
                </div>
            </div>
            
            <div class="footer">
                <p>© 2024 IhamBaobab - Votre plateforme e-commerce de confiance</p>
                <p>Besoin d'aide ? Contactez notre support : support@ihambaobab.com</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    📞 Urgence ? Appelez-nous : +227 XX XX XX XX
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};

module.exports = accountSuspendedTemplate;
