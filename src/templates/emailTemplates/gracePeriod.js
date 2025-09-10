const gracePeriodTemplate = (storeName, gracePeriodEnd, planType, hoursLeft, renewalLink) => {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Période de grâce - Action requise</title>
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
                background: linear-gradient(135deg, #f39c12, #e67e22);
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
            .grace-box {
                background: #fff8e1;
                border: 2px solid #ffb74d;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                text-align: center;
            }
            .grace-icon {
                font-size: 48px;
                color: #f39c12;
                margin-bottom: 10px;
            }
            .hours-left {
                font-size: 36px;
                font-weight: bold;
                color: #e67e22;
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
            .urgent-button {
                display: inline-block;
                background: linear-gradient(135deg, #e74c3c, #c0392b);
                color: white !important;
                text-decoration: none;
                padding: 15px 30px;
                border-radius: 8px;
                font-weight: 600;
                margin: 20px 0;
                text-align: center;
                transition: transform 0.2s;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
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
            .warning-box {
                background: #ffebee;
                border-left: 4px solid #f44336;
                padding: 15px;
                margin: 20px 0;
            }
            .countdown {
                background: linear-gradient(135deg, #ff6b6b, #ee5a52);
                color: white;
                padding: 20px;
                border-radius: 8px;
                text-align: center;
                margin: 20px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⏳ Période de Grâce</h1>
                <p>Votre abonnement a expiré - Action requise d'urgence</p>
            </div>
            
            <div class="content">
                <p>Bonjour <strong>${storeName}</strong>,</p>
                
                <div class="grace-box">
                    <div class="grace-icon">🆘</div>
                    <h2 class="urgent">Votre boutique est en période de grâce</h2>
                    <p>Votre abonnement <strong>${planType}</strong> a expiré, mais votre boutique reste accessible encore :</p>
                    <div class="hours-left">${hoursLeft} heure${hoursLeft > 1 ? 's' : ''}</div>
                    <p class="urgent">Fin de la période de grâce : ${new Date(gracePeriodEnd).toLocaleDateString('fr-FR')} à ${new Date(gracePeriodEnd).toLocaleTimeString('fr-FR')}</p>
                </div>
                
                <div class="countdown">
                    <h3>⚡ TEMPS LIMITÉ ⚡</h3>
                    <p>Votre boutique sera <strong>automatiquement suspendue</strong> dans ${hoursLeft} heure${hoursLeft > 1 ? 's' : ''} si aucune action n'est prise.</p>
                </div>
                
                <div class="warning-box">
                    <h4>🚨 Que se passe-t-il après la période de grâce ?</h4>
                    <ul>
                        <li><strong>❌ Suspension immédiate de votre boutique</strong></li>
                        <li><strong>❌ Vos clients ne pourront plus commander</strong></li>
                        <li><strong>❌ Perte de visibilité sur la plateforme</strong></li>
                        <li><strong>💰 Perte de revenus potentiels</strong></li>
                    </ul>
                </div>
                
                <h3>💡 Que faire maintenant ?</h3>
                <ol>
                    <li><strong>Cliquez sur le bouton ci-dessous IMMÉDIATEMENT</strong></li>
                    <li>Choisissez votre plan de renouvellement</li>
                    <li>Effectuez le paiement en ligne</li>
                    <li>Votre boutique sera réactivée automatiquement</li>
                </ol>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${renewalLink}" class="urgent-button">
                        🚀 RENOUVELER MAINTENANT
                    </a>
                </div>
                
                <div class="plan-info">
                    <h3>💎 Recommandation spéciale</h3>
                    <p><strong>Passez à l'abonnement annuel</strong> et bénéficiez de :</p>
                    <ul>
                        <li>✅ 20% d'économies garanties</li>
                        <li>✅ Aucune interruption de service</li>
                        <li>✅ Rappels automatiques 30 jours avant expiration</li>
                        <li>✅ Support prioritaire inclus</li>
                    </ul>
                </div>
                
                <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; text-align: center;">
                        <strong>⏰ N'attendez pas ! Chaque minute compte pour éviter la suspension.</strong>
                    </p>
                </div>
            </div>
            
            <div class="footer">
                <p>© 2024 IhamBaobab - Votre plateforme e-commerce de confiance</p>
                <p><strong>Support d'urgence :</strong> support@ihambaobab.com</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    📞 Ligne directe : +227 XX XX XX XX (disponible 24h/24)
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};

module.exports = gracePeriodTemplate;
