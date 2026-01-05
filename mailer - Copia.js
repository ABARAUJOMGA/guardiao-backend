import { Resend } from "resend";

let resend = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn("⚠️ RESEND_API_KEY ausente — emails desativados");
}

export async function enviarEmail(params) {
  if (!resend) {
    console.log("📭 Email ignorado (ambiente local)");
    return;
  }

  return resend.emails.send(params);
}
