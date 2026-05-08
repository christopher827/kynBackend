const jwt = require("jsonwebtoken");

function  getJwtToken(user) {  
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });}

const sendToken = (user, statusCode, res) => {
  const token = getJwtToken(user);
      const options = {
      expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      sameSite: "none",
      secure: true,
    };

    res.status(statusCode).cookie("token", token, options).json({
      success: true,
      user,
      token,
    });
  };
  module.exports = {sendToken,getJwtToken};