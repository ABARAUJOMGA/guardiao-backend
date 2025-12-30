import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

import { rodarMonitoramento } from "./monitor.js";
import { enviarEmail } from "./mailer.js";
import { adminAuth } from "./adminAuth.js";

/* =========================
   APP INIT
========================= */
const app = express();
app.set("trust proxy", 1);

/* =========================
   CORS
========================= */
const allowedOrigins = [
  "https://guardiaorastreamento.com.br",
  "https://www.guardiaorastreamento.com.br",
  "null" // file:// local
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-ADMIN-KEY"]
  })
);

app.options("*", cors());
app.use(express.json());

/* =========================
   PATHS
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   STATIC FRONTEND
========================= */
// Landing page
app.use(express.static(path.join(__dirname, "public")));

// Admin panel
app.use("/admin", express.static(path.join(__dirname, "public")));

/* =========================
   SUPABASE
========================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Variáveis do Supabase não configuradas");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({ status: "Guardião API online" });
});

/* =========================
   USERS (MINI CADASTRO)
========================= */
app.post("/users", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email obrigatório" });
  }

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (existing) {
    return res.json(existing);
  }

  const { data, error } = await supabase
    .from("users")
    .insert([{ email }])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});

/* =========================
   CREATE TRACKING
========================= */
app.post("/trackings", async (req, res) => {
  const { user_id, tracking_code } = req.body;

  if (!user_id || !tracking_code) {
    return res.status(400).json({ error: "Dados obrigatórios" });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user_id)
    .single();

  if (userError || !user) {
    return res.status(400).json({ error: "Usuário inválido" });
  }

  const limit = user.plan === "essential" ? 50 : 1;

  const { count } = await supabase
    .from("trackings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("status", "active");

  if (count >= limit) {
    return res.status(403).json({
      error: `Seu plano permite até ${limit} monitoramentos ativos`
    });
  }

  const { data, error } = await supabase
    .from("trackings")
    .insert([{ user_id, tracking_code }])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});

/* =========================
   LIST USER TRACKINGS
========================= */
app.get("/trackings/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const { data, error } = await supabase
    .from("trackings")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});

/* =========================
   RUN MONITOR (JOB)
========================= */
app.post("/run-monitor", async (req, res) => {
  await rodarMonitoramento();
  res.json({ status: "Monitoramento executado" });
});

/* =========================
   ADMIN — LIST TRACKINGS
========================= */
app.get("/admin/trackings", adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("trackings")
    .select(`
      id,
      tracking_code,
      status,
      flow_stage,
      last_status_raw,
      alert_sent,
      delivered_at
    `)
    .is("delivered_at", null)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* =========================
   ADMIN — CHECKS
========================= */
app.post("/admin/trackings/:id/check", adminAuth, async (req, res) => {
  const { check_type } = req.body;

  await supabase.from("tracking_checks").insert([{
    tracking_id: req.params.id,
    check_type
  }]);

  res.json({ ok: true });
});

/* =========================
   ADMIN — EXCEPTION
========================= */
app.post("/admin/trackings/:id/exception", adminAuth, async (req, res) => {
  const { exception_type, severity, status_raw } = req.body;

  await supabase.from("tracking_exceptions").insert([{
    tracking_id: req.params.id,
    exception_type,
    severity,
    status_raw
  }]);

  await supabase.from("trackings").update({
    status: "exception",
    flow_stage: "exception"
  }).eq("id", req.params.id);

  res.json({ ok: true });
});

/* =========================
   ADMIN — SEND EMAIL
========================= */
app.post("/admin/trackings/:id/send-email", adminAuth, async (req, res) => {
  const trackingId = req.params.id;

  const { data: tracking } = await supabase
    .from("trackings")
    .select(`
      tracking_code,
      alert_sent,
      last_status_raw,
      users ( email )
    `)
    .eq("id", trackingId)
    .single();

  if (!tracking || tracking.alert_sent) {
    return res.status(409).json({ error: "Email já enviado ou tracking inválido" });
  }

  await enviarEmail({
    to: tracking.users.email,
    subject: "⚠️ Atenção: encomenda requer ação",
    text: `
Olá,

Detectamos uma situação que pode exigir atenção em uma encomenda monitorada.

Código: ${tracking.tracking_code}
Status: ${tracking.last_status_raw || "Não informado"}

Este alerta faz parte do monitoramento gratuito (1 encomenda).

Para monitorar mais encomendas e não ser mais surpreendido por exceções,
assine o Plano Essencial (até 50 encomendas):

👉 https://SEU_LINK_MERCADO_PAGO_AQUI

— Guardião de Rastreamento
    `
  });

  await supabase.from("tracking_exceptions")
    .update({ email_sent: true })
    .eq("tracking_id", trackingId);

  await supabase.from("trackings")
    .update({ alert_sent: true })
    .eq("id", trackingId);

  res.json({ ok: true });
});

/* =========================
   ADMIN — DELIVERED
========================= */
app.post("/admin/trackings/:id/delivered", adminAuth, async (req, res) => {
  await supabase.from("trackings").update({
    status: "delivered",
    flow_stage: "delivered",
    delivered_at: new Date().toISOString()
  }).eq("id", req.params.id);

  res.json({ ok: true });
});

/* =========================
   EVENTS (SUPORTE)
========================= */
app.post("/events", async (req, res) => {
  const { type, payload } = req.body;

  await supabase.from("events").insert([{
    type,
    payload
  }]);

  if (type === "support_request") {
    await enviarEmail({
      to: "atendimento@abaraujo.com",
      subject: "📩 Novo chamado de suporte — Guardião",
      text: `
Novo chamado de suporte recebido:

Nome: ${payload.name}
Email: ${payload.email}

Mensagem:
${payload.message}

Responder em até 24h.
      `
    });
  }

  res.json({ ok: true });
});

/* =========================
   FRONTEND FALLBACK
========================= */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Guardião rodando na porta ${PORT}`);
});
