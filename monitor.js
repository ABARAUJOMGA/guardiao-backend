import { createClient } from "@supabase/supabase-js";
import { enviarEmail } from "./mailer.js";
import { ENV } from "./env.js";

/* =====================================================
   CONEXÃO SUPABASE (RESILIENTE)
===================================================== */

let supabase = null;

if (ENV.SUPABASE_URL && ENV.SUPABASE_KEY) {
  supabase = createClient(
    ENV.SUPABASE_URL,
    ENV.SUPABASE_KEY
  );
  console.log("✅ Supabase conectado");
} else {
  console.warn("⚠️ Supabase desativado (ambiente local)");
}

export { supabase };

/* =====================================================
   SIMULAÇÃO CORREIOS (MVP)
===================================================== */

function consultarCorreiosSimulado(trackingCode) {
  return "AGUARDANDO RETIRADA";
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

  const { data: regras, error: regrasError } = await supabase
    .from("exception_rules")
    .select("*")
    .eq("notify", true);

  if (regrasError) {
    console.error("🔴 Erro ao buscar regras:", regrasError);
    return;
  }

  for (const tracking of trackings) {
    try {
      if (!tracking.user_id || tracking.alert_sent) continue;

      const statusAtual = consultarCorreiosSimulado(tracking.tracking_code);

      const regraEncontrada = regras.find(r =>
        statusAtual.includes(r.status_match)
      );
      if (!regraEncontrada) continue;

      const { data: user } = await supabase
        .from("users")
        .select("email")
        .eq("id", tracking.user_id)
        .single();

      if (!user?.email) continue;

      await enviarEmail({
        to: user.email,
        subject: "⚠️ Problema detectado na entrega",
        text: `Status atual: ${statusAtual}`
      });

      await supabase
        .from("trackings")
        .update({
          status: "exception",
          alert_sent: true,
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
