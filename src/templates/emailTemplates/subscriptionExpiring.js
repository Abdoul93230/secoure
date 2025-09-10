const subscriptionExpiringTemplate = (storeName, expiryDate, planType, daysLeft, renewalLink) => {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Votre abonnement expire bientôt</title>
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
                background: linear-gradient(135deg, #ff6b6b, #ff8e3c);
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
            .warning-box {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                text-align: center;
            }
            .warning-icon {
                font-size: 48px;
                color: #f39c12;
                margin-bottom: 10px;
            }
            .days-left {
                font-size: 36px;
                font-weight: bold;
                color: #e74c3c;
                margin: 10px 0;
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
            .renewal-button {
                display: inline-block;
                background: linear-gradient(135deg, #00b894, #00cec9);
                color: white !important;
                text-decoration: none;
                padding: 15px 30px;
                border-radius: 8px;
                font-weight: 600;
                margin: 20px 0;
                text-align: center;
                transition: transform 0.2s;
            }
            .renewal-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(0,184,148,0.3);
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
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ Expiration d'abonnement</h1>
                <p>Votre abonnement IhamBaobab expire bientôt</p>
            </div>
            
            <div class="content">
                <p>Bonjour <strong>${storeName}</strong>,</p>
                
                <div class="warning-box">
                    <div class="warning-icon">⏰</div>
                    <h2>Votre abonnement expire dans :</h2>
                    <div class="days-left">${daysLeft} jour${daysLeft > 1 ? 's' : ''}</div>
                    <p class="urgent">Date d'expiration : ${new Date(expiryDate).toLocaleDateString('fr-FR')}</p>
                </div>
                
                <div class="plan-info">
                    <h3>📦 Plan actuel : ${planType}</h3>
                    <p>Pour continuer à bénéficier de tous les avantages de votre boutique en ligne, veuillez renouveler votre abonnement avant la date d'expiration.</p>
                </div>
                
                <h3>🚨 Que se passe-t-il si je ne renouvelle pas ?</h3>
                <ul>
                    <li><strong>Jour J :</strong> Votre boutique entre en période de grâce (48h)</li>
                    <li><strong>Après 48h :</strong> Votre boutique sera suspendue</li>
                    <li><strong>Vos clients ne pourront plus passer commande</strong></li>
                    <li><strong>Vos produits ne seront plus visibles</strong></li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${renewalLink}" class="renewal-button">
                        🔄 Renouveler maintenant
                    </a>
                </div>
                
                <p style="font-size: 14px; color: #7f8c8d;">
                    💡 <strong>Astuce :</strong> Choisissez l'abonnement annuel pour économiser jusqu'à 20% et éviter les interruptions de service.
                </p>
            </div>
            
            <div class="footer">
                <p>© 2024 IhamBaobab - Votre plateforme e-commerce de confiance</p>
                <p>Besoin d'aide ? Contactez notre support : support@ihambaobab.com</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

module.exports = subscriptionExpiringTemplate;
