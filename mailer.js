import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

export async function enviarEmail({ to, subject, text }) {
  await transporter.sendMail({
    from: `"Guardião de Rastreamento" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text
  });
}
