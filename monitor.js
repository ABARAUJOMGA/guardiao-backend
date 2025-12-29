import { createClient } from "@supabase/supabase-js";
import { enviarEmail } from "./mailer.js";

/* =====================================================
   CONEXÃO SUPABASE
===================================================== */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/* =====================================================
   SIMULAÇÃO CORREIOS (MVP)
===================================================== */
function consultarCorreiosSimulado(trackingCode) {
  // MVP: sempre retorna um status de exceção conhecido
  return "AGUARDANDO RETIRADA";
}

/* =====================================================
   JOB PRINCIPAL
===================================================== */
export async function rodarMonitoramento() {
  console.log("🟢 Iniciando job de monitoramento");

  /* ---------------------------------------------
     1. BUSCAR TRACKINGS ATIVOS
  --------------------------------------------- */
  const { data: trackings, error: trackingError } = await supabase
    .from("trackings")
    .select("*")
    .eq("status", "active");

  if (trackingError) {
    console.error("🔴 Erro ao buscar trackings:", trackingError);
    return;
  }

  console.log(`🔎 Trackings ativos encontrados: ${trackings.length}`);

  if (!trackings.length) {
    console.log("ℹ️ Nenhum tracking ativo para processar");
    return;
  }

  /* ---------------------------------------------
     2. BUSCAR REGRAS DE EXCEÇÃO ATIVAS
  --------------------------------------------- */
  const { data: regras, error: regrasError } = await supabase
    .from("exception_rules")
    .select("*")
    .eq("notify", true);

  if (regrasError) {
    console.error("🔴 Erro ao buscar regras:", regrasError);
    return;
  }

  console.log(`📋 Regras de exceção ativas: ${regras.length}`);

  /* ---------------------------------------------
     3. PROCESSAR TRACKINGS
  --------------------------------------------- */
  for (const tracking of trackings) {
    console.log(`➡️ Processando tracking ${tracking.id}`);

    try {
      /* ---------- sanity checks ---------- */
      if (!tracking.user_id) {
        console.warn(`⚠️ Tracking ${tracking.id} ignorado (user_id nulo)`);
        continue;
      }

      if (tracking.alert_sent) {
        console.log(`⏭️ Tracking ${tracking.id} já alertado, pulando`);
        continue;
      }

      /* ---------- consulta status ---------- */
      const statusAtual = consultarCorreiosSimulado(tracking.tracking_code);

      console.log(
        `📦 Status atual ${tracking.tracking_code}: ${statusAtual}`
      );

      /* ---------- verificar regra ---------- */
      const regraEncontrada = regras.find(regra =>
        statusAtual.includes(regra.status_match)
      );

      if (!regraEncontrada) {
        console.log(
          `⏭️ Nenhuma regra bateu para ${tracking.tracking_code}`
        );
        continue;
      }

      console.log(
        `🚨 Exceção detectada para ${tracking.tracking_code}: ${statusAtual}`
      );

      /* ---------- buscar usuário ---------- */
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("email")
        .eq("id", tracking.user_id)
        .single();

      if (userError || !user?.email) {
        console.error(
          `🔴 Usuário inválido para tracking ${tracking.id}`,
          userError
        );
        continue;
      }

      console.log(`📨 Usuário encontrado: ${user.email}`);

      /* ---------- ENVIO DE EMAIL ---------- */
      console.log("📨 Chamando enviarEmail agora");

      await enviarEmail({
        to: user.email,
        subject: "⚠️ Problema detectado na entrega",
        text: `
Olá,

Detectamos um problema no envio ${tracking.tracking_code}.

Status atual: ${statusAtual}

Recomendamos avisar o cliente antes que ele perceba.

— Guardião de Rastreamento
        `
      });

      console.log("✅ Email enviado com sucesso");

      /* ---------- atualizar tracking ---------- */
      const { error: updateError } = await supabase
        .from("trackings")
        .update({
          status: "exception",
          alert_sent: true,
          last_status_raw: statusAtual,
          last_checked_at: new Date().toISOString()
        })
        .eq("id", tracking.id);

      if (updateError) {
        console.error(
          `🔴 Erro ao atualizar tracking ${tracking.id}`,
          updateError
        );
      } else {
        console.log(`✅ Tracking ${tracking.id} atualizado com exceção`);
      }

    } catch (err) {
      console.error(
        `💥 Erro inesperado no tracking ${tracking.id}`,
        err
      );
    }
  }

  console.log("🏁 Job de monitoramento finalizado");
}
