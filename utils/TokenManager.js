const jwt = require('jsonwebtoken');

class TokenManager {
  generateToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  }
}

module.exports = new TokenManager();
