const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const { User } = require("../Models");

// Mémoire temporaire pour stocker les codes OTP
const otpCodes = new Map();

// Point de terminaison pour la génération du code OTP et l'envoi par e-mail
const forgot_password = async (req, res) => {
  const { email } = req.body;

  if (email) {
    try {
      const existingUserByEmail = await User.findOne({ email: email });
      if (existingUserByEmail) {
        // Générer un code OTP aléatoire
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Stocker le code OTP avec l'email associé
        otpCodes.set(email, otp);

        // Envoyer l'e-mail avec le code OTP
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "HabouNiger227@gmail.com",
            pass: "lctrgorwycvjrqcv",
          },
          tls: {
            rejectUnauthorized: false, // C'est ici que vous désactivez la vérification du certificat
          },
        });
        const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Récupération de mot de passe - E-HABOU</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');

    :root {
      --primary-color: #30A08B;
      --secondary-color: #B2905F;
      --accent-color: #B17236;
      --text-color: #2D3748;
      --bg-color: #F7FAFC;
      --card-bg: #FFFFFF;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Poppins', sans-serif;
      background-color: var(--bg-color);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(48, 160, 139, 0.1) 0%, transparent 20%),
        radial-gradient(circle at 90% 80%, rgba(178, 144, 95, 0.1) 0%, transparent 20%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      color: var(--text-color);
    }

    header {
      background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
      padding: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      position: relative;
      overflow: hidden;
    }

    header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='rgba(255,255,255,0.1)' fill-rule='evenodd'/%3E%3C/svg%3E");
      opacity: 0.3;
    }

    .logo {
      font-size: 2rem;
      font-weight: 700;
      color: white;
      text-transform: uppercase;
      letter-spacing: 2px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
    }

    main {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
    }

    .otp-container {
      background: var(--card-bg);
      border-radius: 1rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 2.5rem;
      width: 100%;
      max-width: 500px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .otp-container::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 4px;
      background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
    }

    h2 {
      color: var(--primary-color);
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      font-weight: 600;
    }

    .otp-description {
      color: #4A5568;
      margin-bottom: 1.5rem;
      font-size: 1.1rem;
    }

    .otp-code {
      background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
      color: black;
      padding: 1rem 2rem;
      font-size: 2rem;
      font-weight: 600;
      border-radius: 0.5rem;
      display: inline-block;
      margin: 1.5rem 0;
      letter-spacing: 4px;
      box-shadow: 0 4px 6px -1px rgba(48, 160, 139, 0.3);
      animation: pulse 2s infinite;
    }

    .contact-info {
      margin: 2rem 0;
      padding: 1.5rem;
      background: rgba(48, 160, 139, 0.05);
      border-radius: 0.5rem;
      text-align: left;
      border: 1px solid rgba(48, 160, 139, 0.1);
    }

    .contact-item {
      display: flex;
      align-items: center;
      margin-bottom: 1rem;
      color: #4A5568;
      transition: transform 0.2s;
    }

    .contact-item:hover {
      transform: translateX(5px);
    }

    .contact-item i {
      color: var(--accent-color);
      margin-right: 1rem;
      width: 20px;
    }

    .contact-item a {
      color: inherit;
      text-decoration: none;
      transition: color 0.2s;
    }

    .contact-item a:hover {
      color: var(--primary-color);
    }

    .contact-button {
      display: inline-flex;
      align-items: center;
      background: linear-gradient(135deg, var(--accent-color), var(--secondary-color));
      color: white;
      padding: 0.875rem 1.5rem;
      border-radius: 0.5rem;
      text-decoration: none;
      font-weight: 500;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 6px -1px rgba(177, 114, 54, 0.3);
    }

    .contact-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 8px -1px rgba(177, 114, 54, 0.4);
    }

    .contact-button i {
      margin-right: 0.5rem;
    }

    @keyframes pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(48, 160, 139, 0.4);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(48, 160, 139, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(48, 160, 139, 0);
      }
    }

    @media (max-width: 640px) {
      .otp-container {
        padding: 1.5rem;
      }

      .logo {
        font-size: 1.5rem;
      }

      .otp-code {
        font-size: 1.5rem;
        padding: 0.75rem 1.5rem;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1 class="logo">E-HABOU</h1>
  </header>

  <main>
    <div class="otp-container">
      <h2>Récupération de mot de passe</h2>
      <p class="otp-description">Voici votre code de vérification unique :</p>
      
      <div class="otp-code">${otp}</div>
      
      <p class="otp-description">
        Ce code expirera dans 10 minutes. Ne le partagez avec personne.
      </p>

      <div class="contact-info">
        <div class="contact-item">
          <i class="fas fa-globe"></i>
          <a href="http://habou227.onrender.com" target="_blank">habou227.onrender.com</a>
        </div>
        <div class="contact-item">
          <i class="fas fa-phone"></i>
          <a href="tel:+22787727501">+227 87727501</a>
        </div>
        <div class="contact-item">
          <i class="fas fa-map-marker-alt"></i>
          <span>Niamey, Niger</span>
        </div>
      </div>

      <a href="mailto:HabouNiger227@gmail.com" class="contact-button">
        <i class="fas fa-envelope"></i>
        Nous contacter
      </a>
    </div>
  </main>
</body>
</html>
          `;

        const mailOptions = {
          from: `<HabouNiger227@gmail.com>`,
          to: email,
          subject: `Code OTP pour la récupération de mot de passe`,
          text: `Votre code OTP est : ${otp}`,
          html: htmlContent,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error("Erreur lors de l'envoi de l'e-mail:", error);
            return res.status(500).json({
              message: "Erreur lors de l'envoi de l'e-mail",
              data: error,
            });
          } else {
            console.log("E-mail envoyé à :", info.response);
            // Envoyer la copie de l'e-mail à vous-même ou à une autre adresse (facultatif)

            res
              .status(200)
              .json({ message: "Code OTP envoyé par e-mail avec succès" });
          }
        });
      } else {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi du code otp : ", error);
      return res.status(500).send({
        message: "Erreur lors de l'envoi du code otp :",
        data: error,
      });
    }
  }
};

// Point de terminaison pour la vérification du code OTP et la mise à jour du mot de passe
const reset_password = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // Vérifier si le code OTP est correct
  if (otpCodes.get(email) === otp) {
    try {
      // Vérifier si l'utilisateur existe dans la base de données
      const existingUserByEmail = await User.findOne({ email: email });

      if (existingUserByEmail) {
        // Hacher le nouveau mot de passe
        const hash = await bcrypt.hash(newPassword, 10);

        // Mettre à jour le mot de passe dans la base de données
        await User.updateOne({ email: email }, { password: hash });

        console.log(`Mot de passe mis à jour pour ${email}`);

        // Supprimer le code OTP après utilisation
        otpCodes.delete(email);

        return res
          .status(200)
          .json({ message: "Mot de passe mis à jour avec succès" });
      } else {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour du mot de passe:", error);
      return res.status(500).send({
        message: "Erreur lors de la mise à jour du mot de passe",
        data: error,
      });
    }
  } else {
    return res.status(401).json({ message: "Code OTP incorrect" });
  }
};

module.exports = {
  forgot_password,
  reset_password,
};
