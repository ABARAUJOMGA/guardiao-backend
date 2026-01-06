import { Resend } from "resend";

let resend = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn("⚠️ RESEND_API_KEY ausente — emails desativados");
}

const FROM_EMAIL = "Guardião <alertas@guardiaorastreamento.com.br>";

export async function enviarEmail({ to, subject, text }) {
  if (!resend) {
    console.log("📭 Email ignorado (ambiente local)");
    return;
  }

  try {
    return await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      text
    });
  } catch (err) {
    console.error("💥 Erro ao enviar email via Resend:", err);
    throw err;
  }
}
