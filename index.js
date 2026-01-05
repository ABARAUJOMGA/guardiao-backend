import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import rateLimit from "express-rate-limit";

import { rodarMonitoramento } from "./monitor.js";
import { enviarEmail } from "./mailer.js";
import { adminAuth } from "./adminAuth.js";

/* =========================
   PATHS E APP INIT
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

/* =========================
   CSP (MANTIDO 100%)
========================= */
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
      "img-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join("; ")
  );
  next();
});

/* =========================
   MIDDLEWARES
========================= */
app.use(express.json());


const allowedOrigins = [
  "https://guardiaorastreamento.com.br",
  "https://www.guardiaorastreamento.com.br",
  "https://guardiao-backend-production.up.railway.app",
  "null"
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
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.options("*", cors());

/* =========================
   RATE LIMIT (ADMIN)
========================= */


const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60,             // 60 requests por IP
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/admin", adminLimiter);


/* =========================
   FRONTEND ESTÁTICO
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   SUPABASE (RESILIENTE)
========================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log("✅ Supabase conectado");
} else {
  console.warn("⚠️ Supabase NÃO configurado (ambiente local)");
}

/* =========================
   GUARD GLOBAL
========================= */
function requireSupabase(req, res) {
  if (!supabase) {
    res.status(503).json({
      error: "Serviço indisponível no ambiente atual"
    });
    return false;
  }
  return true;
}

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({
    status: "VERSAO NOVA - DEPLOY OK",
    supabase: !!supabase
  });
});

/* =========================
   USERS
========================= */
app.post("/users", async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email obrigatório" });

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (existing) return res.json(existing);

  const { data, error } = await supabase
    .from("users")
    .insert([{ email }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/* =========================
   TRACKINGS (CRIAR)
========================= */
app.post("/trackings", async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { user_id, tracking_code } = req.body;
  if (!user_id || !tracking_code) {
    return res.status(400).json({ error: "Dados obrigatórios" });
  }

  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user_id)
    .single();

  const limit = user?.plan === "essential" ? 50 : 1;

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
    .insert([{ user_id, tracking_code, status: "active" }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/* =========================
   TRACKINGS (LISTAR DO USUÁRIO)
========================= */
app.get("/trackings/:user_id", async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { user_id } = req.params;

  const { data, error } = await supabase
    .from("trackings")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/* =========================
   JOB MANUAL
========================= */
app.post("/run-monitor", async (req, res) => {
  await rodarMonitoramento();
  res.json({ status: "Monitoramento executado" });
});

/* =========================
   ADMIN — LISTAR TRACKINGS
========================= */
app.get("/admin/trackings", adminAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Supabase indisponível" });
  }

  const page = parseInt(req.query.page || "1");
  const limit = parseInt(req.query.limit || "20");
  const offset = (page - 1) * limit;
  const email = req.query.email;

  let userIds = null;

  // Resolver usuários por email (se houver filtro)
  if (email) {
    const { data: users, error: userError } = await supabase
      .from("users")
      .select("id")
      .ilike("email", `%${email}%`);

    if (userError) {
      return res.status(500).json({ error: userError.message });
    }

    if (!users || users.length === 0) {
      return res.json({
        page,
        limit,
        total: 0,
        items: []
      });
    }

    userIds = users.map(u => u.id);
  }

  // Buscar trackings SEM joins perigosos
  let query = supabase
    .from("trackings")
    .select("*, users(email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userIds) {
    query = query.in("user_id", userIds);
  }

  const { data: trackings, count, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Contagens manuais (seguras)
  const items = [];

  for (const t of trackings) {
    const [{ count: exceptionsCount }, { count: emailsCount }] =
      await Promise.all([
        supabase
          .from("tracking_exceptions")
          .select("*", { count: "exact", head: true })
          .eq("tracking_id", t.id),

        supabase
          .from("tracking_emails")
          .select("*", { count: "exact", head: true })
          .eq("tracking_id", t.id)
      ]);

    items.push({
      ...t,
      exceptions_count: exceptionsCount || 0,
      alerts_count: emailsCount || 0
    });
  }

  res.json({
    page,
    limit,
    total: count,
    items
  });
});


app.get("/admin/trackings/:id/history", adminAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Supabase indisponível" });
  }

  const trackingId = req.params.id;

  const [checks, exceptions, emails] = await Promise.all([
    supabase
      .from("tracking_checks")
      .select("*")
      .eq("tracking_id", trackingId)
      .order("created_at", { ascending: false }),

    supabase
      .from("tracking_exceptions")
      .select("*")
      .eq("tracking_id", trackingId)
      .order("created_at", { ascending: false }),

    supabase
      .from("tracking_emails")
      .select("*")
      .eq("tracking_id", trackingId)
      .order("created_at", { ascending: false })
  ]);

  res.json({
    checks: checks.data || [],
    exceptions: exceptions.data || [],
    emails: emails.data || []
  });
});


app.get("/admin/exceptions/templates", adminAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Supabase indisponível" });
  }

  const { data, error } = await supabase
    .from("tracking_exceptions")
    .select("exception_type, severity, status_raw")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // remove duplicadas
  const unique = [];
  const seen = new Set();

  for (const e of data) {
    const key = `${e.exception_type}|${e.severity}|${e.status_raw}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(e);
    }
  }

  res.json(unique);
});


/* =========================
   ADMIN — CHECK MANUAL
========================= */
app.post("/admin/trackings/:id/check", adminAuth, async (req, res) => {
  if (!requireSupabase(req, res)) return;

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
  if (!requireSupabase(req, res)) return;

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
  if (!requireSupabase(req, res)) return;

  const trackingId = req.params.id;

  const { data: tracking } = await supabase
    .from("trackings")
    .select("tracking_code, alert_sent, last_status_raw, users(email)")
    .eq("id", trackingId)
    .single();

  if (!tracking || tracking.alert_sent) {
    return res.status(409).json({ error: "Email já enviado ou inválido" });
  }

  await enviarEmail({
    to: tracking.users.email,
    subject: "⚠️ Atenção: encomenda requer ação",
    text: `
Código: ${tracking.tracking_code}
Status: ${tracking.last_status_raw || "Não informado"}
    `
  });

  await supabase.from("trackings")
    .update({ alert_sent: true })
    .eq("id", trackingId);

  res.json({ ok: true });
});

/* =========================
   ADMIN — DELIVERED
========================= */
app.post("/admin/trackings/:id/delivered", adminAuth, async (req, res) => {
  if (!requireSupabase(req, res)) return;

  await supabase.from("trackings").update({
    status: "delivered",
    delivered_at: new Date().toISOString()
  }).eq("id", req.params.id);

  res.json({ ok: true });
});

/* =========================
   EVENTS (SUPORTE)
========================= */
app.post("/events", async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { type, payload } = req.body;

  await supabase.from("events").insert([{ type, payload }]);

  if (type === "support_request") {
    await enviarEmail({
      to: "atendimento@abaraujo.com",
      subject: "📩 Novo chamado — Guardião",
      text: `
Nome: ${payload.name}
Email: ${payload.email}

Mensagem:
${payload.message}
      `
    });
  }

  res.json({ ok: true });
});

/* =========================
   FRONTEND FALLBACK (SEM PEGAR ADMIN)
========================= */
app.get("*", (req, res) => {
  if (req.path.startsWith("/admin")) {
    return res.status(404).end();
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Guardião rodando na porta ${PORT}`);
});
