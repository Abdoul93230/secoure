const subscriptionActivatedTemplate = (storeName, planType, startDate, endDate, features, billingCycle) => {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Abonnement activé avec succès</title>
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
                background: linear-gradient(135deg, #00b894, #00cec9);
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
            .success-box {
                background: #d4edda;
                border: 2px solid #c3e6cb;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                text-align: center;
            }
            .success-icon {
                font-size: 48px;
                color: #28a745;
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
            .features-list {
                background: #e8f4fd;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
            }
            .features-list ul {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            .features-list li {
                padding: 8px 0;
                border-bottom: 1px solid #ddd;
            }
            .features-list li:last-child {
                border-bottom: none;
            }
            .features-list li:before {
                content: "✅ ";
                margin-right: 10px;
            }
            .dashboard-button {
                display: inline-block;
                background: linear-gradient(135deg, #6c5ce7, #a29bfe);
                color: white !important;
                text-decoration: none;
                padding: 15px 30px;
                border-radius: 8px;
                font-weight: 600;
                margin: 20px 0;
                text-align: center;
                transition: transform 0.2s;
            }
            .dashboard-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(108,92,231,0.3);
            }
            .footer {
                background: #2c3e50;
                color: white;
                padding: 20px;
                text-align: center;
                font-size: 14px;
            }
            .validity-box {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
                text-align: center;
            }
            .tips-box {
                background: #e8f5e8;
                border-left: 4px solid #28a745;
                padding: 15px;
                margin: 20px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Félicitations !</h1>
                <p>Votre abonnement IhamBaobab est maintenant actif</p>
            </div>
            
            <div class="content">
                <p>Bonjour <strong>${storeName}</strong>,</p>
                
                <div class="success-box">
                    <div class="success-icon">✅</div>
                    <h2>Abonnement activé avec succès !</h2>
                    <p>Votre boutique est maintenant pleinement opérationnelle avec toutes les fonctionnalités de votre plan.</p>
                </div>
                
                <div class="plan-info">
                    <h3>📦 Détails de votre abonnement</h3>
                    <p><strong>Plan :</strong> ${planType}</p>
                    <p><strong>Cycle de facturation :</strong> ${billingCycle === 'annual' ? 'Annuel' : 'Mensuel'}</p>
                    <p><strong>Date d'activation :</strong> ${new Date(startDate).toLocaleDateString('fr-FR')}</p>
                    <p><strong>Date d'expiration :</strong> ${new Date(endDate).toLocaleDateString('fr-FR')}</p>
                </div>
                
                <div class="validity-box">
                    <h4>⏰ Durée de validité</h4>
                    <p>Votre abonnement est valide pendant <strong>${Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))} jours</strong></p>
                </div>
                
                <div class="features-list">
                    <h3>🚀 Fonctionnalités incluses dans votre plan</h3>
                    <ul>
                        ${features.map(feature => `<li>${feature}</li>`).join('')}
                    </ul>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://ihambaobab.com/seller/dashboard" class="dashboard-button">
                        📊 Accéder à mon tableau de bord
                    </a>
                </div>
                
                <div class="tips-box">
                    <h4>💡 Conseils pour maximiser votre succès</h4>
                    <ul>
                        <li><strong>Complétez votre profil boutique</strong> pour inspirer confiance</li>
                        <li><strong>Ajoutez des photos de qualité</strong> à vos produits</li>
                        <li><strong>Configurez vos méthodes de paiement</strong></li>
                        <li><strong>Définissez vos zones de livraison</strong></li>
                        <li><strong>Créez vos premières promotions</strong></li>
                    </ul>
                </div>
                
                <div class="plan-info">
                    <h3>📞 Support client</h3>
                    <p>Notre équipe est là pour vous accompagner :</p>
                    <ul>
                        <li>📧 <strong>Email :</strong> support@ihambaobab.com</li>
                        <li>📱 <strong>WhatsApp :</strong> +227 XX XX XX XX</li>
                        <li>⏰ <strong>Horaires :</strong> Lun-Ven 8h-18h, Sam 9h-15h</li>
                    </ul>
                </div>
                
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; text-align: center;">
                        <strong>🔔 Rappel automatique :</strong> Vous recevrez un email de rappel 7 jours avant l'expiration de votre abonnement.
                    </p>
                </div>
            </div>
            
            <div class="footer">
                <p>© 2024 IhamBaobab - Votre plateforme e-commerce de confiance</p>
                <p>Merci de nous faire confiance pour développer votre activité !</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    🌐 <a href="https://ihambaobab.com" style="color: #74b9ff;">www.ihambaobab.com</a>
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};

module.exports = subscriptionActivatedTemplate;
