import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function enviarEmail({ to, subject, text }) {
  await resend.emails.send({
    from: "Guardião <onboarding@resend.dev>",
    to,
    subject,
    text
  });
}