// workers/notificationWorker.js
const { Worker } = require("bullmq");
const notificationQueue = require("../queues/notificationQueue");
const sendMail = require("../utils/SendMail");

new Worker(
  "notifications",
  async (job) => {
    const { email, username, requestTitle, KynReward } = job.data;
    await sendMail({
      to: email,
      subject: `New Help Request: ${requestTitle}`,
      text: `Hi ${username},\n\nA new help request matching your interests has been posted: "${requestTitle}".\nReward: ${KynReward} Kyn\n\nCheck it out in the app!`,
    });
    return true;
  },
  {
    connection: notificationQueue.opts.connection,
  },
);
