import { supabase } from "./supabaseClient.js";
import { enviarEmail } from "./mailer.js";

/* =====================================================
   SIMULAÇÃO CORREIOS (MVP)
===================================================== */

function consultarCorreiosSimulado(trackingCode) {
  // MVP: status fixo para teste
  return "AGUARDANDO RETIRADA";
}

/* =====================================================
   TEXTO DO EMAIL (MVP)
===================================================== */

function montarEmailExcecao({ trackingCode, statusAtual }) {
  return `
Olá,

Detectamos uma atualização fora do normal no seu envio.

Código de rastreamento: ${trackingCode}
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

  console.log("🟢 Iniciando job de monitoramento");

  /* -----------------------------------------------------
     1. Buscar trackings ativos
  ----------------------------------------------------- */

  const { data: trackings, error: trackingError } = await supabase
    .from("trackings")
    .select("*")
    .eq("status", "active")
    .is("delivered_at", null);

  if (trackingError) {
    console.error("🔴 Erro ao buscar trackings:", trackingError);
    return;
  }

  console.log(`🔎 Trackings ativos encontrados: ${trackings.length}`);
  if (!trackings.length) return;

  /* -----------------------------------------------------
     2. Buscar regras de exceção
  ----------------------------------------------------- */

  const { data: regras, error: regrasError } = await supabase
    .from("exception_rules")
    .select("*")
    .eq("notify", true);

  if (regrasError) {
    console.error("🔴 Erro ao buscar regras:", regrasError);
    return;
  }

  /* -----------------------------------------------------
     3. Processar cada tracking
  ----------------------------------------------------- */

  for (const tracking of trackings) {
    try {
      if (!tracking.user_id) continue;

      const statusAtual = consultarCorreiosSimulado(tracking.tracking_code);

      const regraEncontrada = regras.find(r =>
        statusAtual.includes(r.status_match)
      );

      if (!regraEncontrada) continue;

      /* -------------------------------------------------
         3.1 Criar exceção (EVENTO)
      ------------------------------------------------- */

      const { data: exception, error: exceptionError } = await supabase
        .from("tracking_exceptions")
        .insert({
          tracking_id: tracking.id,
          exception_type: regraEncontrada.name || "generic",
          severity: regraEncontrada.severity || "medium",
          status_raw: statusAtual,
          email_sent: false
        })
        .select()
        .single();

      if (exceptionError) {
        console.error("💥 Erro ao criar exceção:", exceptionError);
        continue;
      }

      /* -------------------------------------------------
         3.2 Buscar email do usuário
      ------------------------------------------------- */

      const { data: user } = await supabase
        .from("users")
        .select("email")
        .eq("id", tracking.user_id)
        .single();

      if (!user?.email) continue;

      /* -------------------------------------------------
         3.3 Enviar email (1 POR EXCEÇÃO)
      ------------------------------------------------- */

      try {
        await enviarEmail({
          to: user.email,
          subject: `⚠️ Problema detectado no envio ${tracking.tracking_code}`,
          text: montarEmailExcecao({
            trackingCode: tracking.tracking_code,
            statusAtual
          })
        });

        await supabase
          .from("tracking_exceptions")
          .update({ email_sent: true })
          .eq("id", exception.id);

        console.log(
          `📨 Email enviado para ${user.email} — ${tracking.tracking_code}`
        );

      } catch (emailErr) {
        console.error("📭 Falha ao enviar email:", emailErr);
      }

      /* -------------------------------------------------
         3.4 Atualizar tracking principal
      ------------------------------------------------- */

      await supabase
        .from("trackings")
        .update({
          status: "exception",
          flow_stage: "exception",
          last_status_raw: statusAtual,
          last_checked_at: new Date().toISOString()
        })
        .eq("id", tracking.id);

    } catch (err) {
      console.error("💥 Erro no monitoramento:", err);
    }
  }

  console.log("🏁 Job finalizado");
}
