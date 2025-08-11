const { Admin } = require("../Models");

const verifyToken = async (req, res) => {
  const data = req.headers;
  const refreshToken = req.cookies;
  const message = "reusit!";
  // console.log(refreshToken);

  res.json({ data, message, ref: refreshToken });
  // console.log(data.authorization);
};

const getAdmin = async (req, res) => {
  const data = req.query;
  // console.log(id);
  try {
    const user = await Admin.findOne({ _id: req.params.adminId });
    if (user) {
      return res.json({ message: "vous avez demander l'utilisateur", user });
    } else {
      return res.status(404).json("l'utilisateur demander n'existe pas");
    }
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: 'Erreur lors de la récupération de l"utilisateur' });
  }
};

module.exports = {
  verifyToken,
  getAdmin,
};
