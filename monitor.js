import { supabase } from "./supabaseClient.js";
import { enviarEmail } from "./mailer.js";

/* =====================================================
   TEXTO DO EMAIL
===================================================== */

function montarEmailExcecao({ trackingCode, statusAtual, exceptionType }) {
  return `
Olá,

Foi registrada uma exceção no seu envio.

Código de rastreamento: ${trackingCode}
Motivo: ${exceptionType}
Status atual: ${statusAtual}

Você está recebendo este aviso para agir antes que o problema
impacte seu cliente.

Acompanhe seus rastreamentos em:
https://guardiaorastreamento.com.br/meus-rastreamentos.html

— Guardião de Rastreamento
`.trim();
}

/* =====================================================
   JOB PRINCIPAL
===================================================== */

export async function rodarMonitoramento() {
  if (!supabase) {
    console.warn("⏭️ Monitoramento ignorado (Supabase indisponível)");
    return;
  }

  console.log("🟢 Iniciando processamento de exceções");

  /* -----------------------------------------------------
     1. Buscar exceções pendentes
  ----------------------------------------------------- */

  const { data: exceptions, error } = await supabase
    .from("tracking_exceptions")
    .select(`
      id,
      exception_type,
      status_raw,
      tracking:tracking_id (
        id,
        tracking_code,
        user_id
      )
    `)
    .eq("email_sent", false);

  if (error) {
    console.error("🔴 Erro ao buscar exceções:", error);
    return;
  }

  console.log(`📌 Exceções pendentes: ${exceptions.length}`);
  if (!exceptions.length) return;

  /* -----------------------------------------------------
     2. Processar cada exceção
  ----------------------------------------------------- */

  for (const exc of exceptions) {
    try {
      if (!exc.tracking?.user_id) continue;

      const { data: user } = await supabase
        .from("users")
        .select("email")
        .eq("id", exc.tracking.user_id)
        .single();

      if (!user?.email) continue;

      await enviarEmail({
        to: user.email,
        subject: `⚠️ Exceção no envio ${exc.tracking.tracking_code}`,
        text: montarEmailExcecao({
          trackingCode: exc.tracking.tracking_code,
          statusAtual: exc.status_raw || "-",
          exceptionType: exc.exception_type
        })
      });

      await supabase
        .from("tracking_exceptions")
        .update({ email_sent: true })
        .eq("id", exc.id);

      console.log(
        `📨 Email enviado — ${exc.tracking.tracking_code} (${exc.exception_type})`
      );

    } catch (err) {
      console.error("💥 Erro ao processar exceção:", err);
    }
  }

  console.log("🏁 Processamento de exceções finalizado");
}
