const PQueue = require("p-queue").default;
const sendMail = require("../utils/SendMail");

// Limit concurrency to 5 emails at a time
const queue = new PQueue({ concurrency: 5 });

const enqueueEmail = (emailData) => {
  queue.add(() => sendMail(emailData));
};

module.exports = enqueueEmail;
