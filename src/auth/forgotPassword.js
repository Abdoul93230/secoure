const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const { User } = require("../Models");

// Mémoire temporaire pour stocker les codes OTP
const otpCodes = new Map();

// Point de terminaison pour la génération du code OTP et l'envoi par e-mail
const forgot_password = (req, res) => {
  const { email } = req.body;

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
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Récupération de mot de passe - E-HABOU</title>
    <style>
      body {
        font-family: 'Arial', sans-serif;
        text-align: center;
        width: 100%;
        height: auto;
        box-sizing: border-box;
        background-color: #f4f4f4;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
  
      header {
        background-color: #FF6969;
        padding: 20px;
        color: white;
        text-align: center;
      }
  
      h1 {
        margin: 0;
        font-family: 'Courier New', Courier, monospace;
        text-transform: uppercase;
        font-style: italic;
        font-size: 24px;
      }
  
      h3 {
        color: #515C6F;
        margin-top: 20px;
        margin-bottom: 10px;
      }
  
      p {
        margin: 10px 8%;
        color: #515C6F;
      }
  
      ul {
        text-align: left;
        margin-top: 20px;
        color: #515C6F;
        list-style-type: none;
        padding: 0;
      }
  
      li {
        margin-bottom: 5px;
      }
  
      .otp-container {
        background-color: #fff;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        padding: 20px;
        width: 80%;
        max-width: 400px;
      }
  
      .otp {
        background-color: #FF6969;
        color: white;
        padding: 10px;
        font-size: 20px;
        border-radius: 4px;
        margin: 10px 0;
      }
  
      .contact-link {
        display: inline-block;
        background-color: #FF6969;
        color: white;
        padding: 10px 12px;
        text-decoration: none;
        border-radius: 4px;
        margin-top: 20px;
        font-weight: bold;
      }
  
      .contact-link:hover {
        background-color: #ff5050;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>E-HABOU</h1>
    </header>
  
    <div class="otp-container">
      <h3>Code OTP pour la récupération de mot de passe :</h3>
      <p>Votre code de récupération est :</p>
      <div class="otp">${otp}</div>
  
      <ul>
        <li>Site Web: <a href="http://habou227.onrender.com" target="_blank">habou227.onrender.com</a></li>
        <li>Téléphone: +227 87727501</li>
        <li>Emplacement: Niamey/Niger</li>
      </ul>
  
      <a class="contact-link" href="mailto:HabouNiger227@gmail.com">Nous contacter</a>
    </div>
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
      return res
        .status(500)
        .json({ message: "Erreur lors de l'envoi de l'e-mail", data: error });
    } else {
      console.log("E-mail envoyé à :", info.response);
      // Envoyer la copie de l'e-mail à vous-même ou à une autre adresse (facultatif)

      res
        .status(200)
        .json({ message: "Code OTP envoyé par e-mail avec succès" });
    }
  });
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
