import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});


export async function enviarEmail({ to, subject, text }) {
  await transporter.sendMail({
    from: `"Guardião de Rastreamento" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text
  });
}

enviarEmail({
  to: process.env.GMAIL_USER,
  subject: "Teste Guardião SMTP",
  text: "Se chegou, SMTP Gmail está OK no Railway."
})
  .then(() => console.log("EMAIL TESTE ENVIADO"))
  .catch(err => console.error("FALHA NO EMAIL TESTE", err));

