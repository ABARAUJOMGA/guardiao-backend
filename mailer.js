import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function enviarEmail({ to, subject, text }) {
  const result = await resend.emails.send({
    from: "Guardião <onboarding@resend.dev>",
    to: "jogodemestreoficial@gmail.com", // <-- IMPORTANTE
    subject,
    text
  });

  console.log("RESEND RESULT:", result);
}
