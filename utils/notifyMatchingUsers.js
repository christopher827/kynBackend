// utils/notifyMatchingUsers.js
const User = require("../models/User");
const emailQueue = require("../queues/emailQueue");

async function notifyMatchingUsers(helpRequest) {
  const { tags, title, _id, KynReward } = helpRequest;

  // Find matching users
  const matchedUsers = await User.find({
    tags: { $in: tags },
    emailNotifications: true,
    Kyn: { $gte: KynReward }, // Only users who can respond
  });

  for (let user of matchedUsers) {
    const html = `
      <p>Hi ${user.firstName},</p>
      <p>A new request matches your interests:</p>
      <h3>${title}</h3>
      <p>Reward: ${KynReward} Kyn points</p>
      <a href="${process.env.APP_URL}/requests/${_id}">Respond Now</a>
    `;

    // Add email job to queue
    emailQueue.add({
      to: user.email,
      subject: `New Help Request: ${title}`,
      html,
    });
  }
}

module.exports = notifyMatchingUsers;
