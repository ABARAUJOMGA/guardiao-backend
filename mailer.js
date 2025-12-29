import { Resend } from "resend";

/**
 * Inicializa o client do Resend
 */
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Envio de email
 */
export async function enviarEmail({ to, subject, text }) {
  console.log("📨 Enviando email para:", to);

  const result = await resend.emails.send({
    from: "Guardião <onboarding@resend.dev>", // sandbox
    to,
    subject,
    text
  });

  console.log("✅ RESEND RESULT:", result);
}
