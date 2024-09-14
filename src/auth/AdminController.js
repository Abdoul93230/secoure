const verifyToken = async (req, res) => {
  const data = req.headers;
  const refreshToken = req.cookies;
  const message = "reusit!";
  // console.log(refreshToken);

  res.json({ data, message, ref: refreshToken });
  // console.log(data.authorization);
};

module.exports = {
  verifyToken,
};
