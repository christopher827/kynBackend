class Validator {
  validateSignup({ email, password, firstName, lastName }) {
    if (!firstName || !lastName) {
      throw new Error('First name and last name are required');
    }

    if (!email || !password) {
      throw new Error('Email and password are required');
    }
  }

  validateLogin({ email, password }) {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
  }
}
module.exports = new Validator();