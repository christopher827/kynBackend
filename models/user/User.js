const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
  },
    fullname: {
    type: String,
  },
  password: {
    type: String,
    required: true,
  },
  kynTag: {
    type: String,
    unique: true,
  },
  bio: { type: String, maxlength: 300 },
  avatar:{
    public_id: {
      type: String,
      required: false,
    },
   url: {
      type: String,
      required: false,
    },
 },
  isBlocked: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },

 skills: {
  type: [String],
  default: [],
 },
 interests: {
  type: [String],
  default: [],
 },
  kynBalance: {
    type: Number,
    default: 0,
  },
  location: {
  type: String,
  default: "",
  },
  role: {
  type: String,
  },
  firstName: {
  type: String,
 },
 isVerified: { type: Boolean, default: false },
 verificationCode: { type: String },
 verificationCodeExpires: { type: Date },
  resetPasswordCode: String,
  resetPasswordExpires: Date,
 reputation: {
  type: Number,
  default: 0,
 },
 badges: {
  type: [String],
  default: [],
 },

}, { timestamps: true });

module.exports = mongoose.model('user', userSchema);