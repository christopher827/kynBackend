const Queue = require("bull");
const nodemailer = require("nodemailer");

const emailQueue = new Queue("emailQueue", {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

// Configure transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Process email jobs
emailQueue.process(async (job) => {
  const { to, subject, html } = job.data;
  await transporter.sendMail({
    from: process.env.SMTP_MAIL,
    to,
    subject,
    html,
  });
});

module.exports = emailQueue;
