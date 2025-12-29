export async function enviarEmail({ to, subject, text }) {
  console.log("📨 Enviando email para:", to);

  const result = await resend.emails.send({
    from: "Guardião <onboarding@resend.dev>",
    to: "jogodemestreoficial@gmail.com",
    subject,
    text
  });

  console.log("✅ RESEND RESULT:", result);
}
