const User = require('../models/user/User');

class UserRepository {
  async findByEmail(email) {
    return await User.findOne({ email });
  }

  async createUser(data) {
    console.log("Creating user with data:", data);
    const user = new User(data);
    return await user.save();
  }
}
module.exports = new UserRepository();