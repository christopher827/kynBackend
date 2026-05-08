const bcrypt = require('bcryptjs');
const UserRepository = require('../repositories/UserRepository');
const TokenManager = require('../utils/TokenManager');

class AuthService {
  async signup(email, password,firstName, lastName) {
    const existingUser = await UserRepository.findByEmail(email);
    if (existingUser) throw new Error('Email already in use');

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await UserRepository.createUser({ email, password: hashedPassword,firstName, lastName  });

    return TokenManager.generateToken(user._id);
  }

  async login(email, password) {
    const user = await UserRepository.findByEmail(email);
    if (!user) throw new Error('Invalid email or password');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error('Invalid email or password');

    return TokenManager.generateToken(user._id);
  }
}

module.exports = new AuthService();