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



async function validarPlanoUsuario(user) {
  if (
    user.plan === "essential" &&
    user.plan_paid_until &&
    new Date(user.plan_paid_until) < new Date()
  ) {
    await supabase
      .from("users")
      .update({
        plan: "free",
        plan_paid_until: null
      })
      .eq("id", user.id);

    return {
      ...user,
      plan: "free"
    };
  }

  return user;
}


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

  // 1️⃣ Busca usuário completo
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("*")
    .eq("id", user_id)
    .single();

  if (userErr || !user) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  // 2️⃣ Valida plano (downgrade automático)
  const userValidado = await validarPlanoUsuario(user);

  // 3️⃣ Define limite
  const limite = userValidado.plan === "essential" ? 50 : 1;

  const { count } = await supabase
    .from("trackings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userValidado.id)
    .neq("status", "delivered");

  if (count >= limite) {
    return res.status(403).json({
      error: "Limite de rastreios atingido para seu plano"
    });
  }

  // 4️⃣ Cria tracking
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
app.get("/users/:id/trackings", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Supabase indisponível" });
  }

  const userId = req.params.id;
  const page = Math.max(parseInt(req.query.page || "1"), 1);
  const limit = Math.max(parseInt(req.query.limit || "10"), 1);
  const status = req.query.status;
  const offset = (page - 1) * limit;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  const userValidado = await validarPlanoUsuario(user);

  let query = supabase
    .from("trackings")
    .select(
      "id, tracking_code, status, last_checked_at, created_at",
      { count: "exact" }
    )
    .eq("user_id", userValidado.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    page,
    limit,
    total: count,
    items: data || []
  });
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

  const page = Math.max(parseInt(req.query.page || "1"), 1);
  const limit = Math.max(parseInt(req.query.limit || "20"), 1);
  const offset = (page - 1) * limit;
  const email = req.query.email?.trim();

  let userIds = null;

  /* =====================================================
     RESOLVE USUÁRIOS PELO EMAIL (SE FILTRAR)
  ===================================================== */
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

  /* =====================================================
     TOTAL DE TRACKINGS (SEM RANGE)
  ===================================================== */
  let countQuery = supabase
    .from("trackings")
    .select("id", { count: "exact", head: true });

  if (userIds) {
    countQuery = countQuery.in("user_id", userIds);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    return res.status(500).json({ error: countError.message });
  }

  /* =====================================================
     SE OFFSET ULTRAPASSA TOTAL → PÁGINA VAZIA
  ===================================================== */
  if (offset >= count) {
    return res.json({
      page,
      limit,
      total: count,
      items: []
    });
  }

  /* =====================================================
     BUSCA TRACKINGS DA PÁGINA
  ===================================================== */
  let query = supabase
    .from("trackings")
    .select("*, users(email)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userIds) {
    query = query.in("user_id", userIds);
  }

  const { data: trackings, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  /* =====================================================
     CONTAGENS (EXCEÇÕES E EMAILS)
  ===================================================== */
  const items = [];

  for (const t of trackings) {
    const [{ count: exceptionsCount }, { count: emailsCount }] =
      await Promise.all([
        supabase
          .from("tracking_exceptions")
          .select("id", { count: "exact", head: true })
          .eq("tracking_id", t.id),

        supabase
          .from("tracking_emails")
          .select("id", { count: "exact", head: true })
          .eq("tracking_id", t.id)
      ]);

    items.push({
      ...t,
      exceptions_count: exceptionsCount || 0,
      alerts_count: emailsCount || 0
    });
  }

  /* =====================================================
     RESPONSE FINAL
  ===================================================== */
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

  const trackingId = req.params.id;
  const { check_type } = req.body;

  const now = new Date().toISOString();

  // registra check
  await supabase.from("tracking_checks").insert([{
    tracking_id: trackingId,
    check_type
  }]);

  // atualiza tracking principal
  await supabase.from("trackings").update({
    last_checked_at: now
  }).eq("id", trackingId);

  res.json({ ok: true });
});


/* =========================
   ADMIN — ATIVAR PLANO
========================= */
app.post("/admin/users/:id/activate-plan", adminAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Supabase indisponível" });
  }

  const userId = req.params.id;
  const { paid_at } = req.body;

  if (!paid_at) {
    return res.status(400).json({ error: "paid_at é obrigatório" });
  }

  const paidAt = new Date(paid_at);
  if (isNaN(paidAt.getTime())) {
    return res.status(400).json({ error: "Data inválida" });
  }

  const paidUntil = new Date(paidAt);
  paidUntil.setMonth(paidUntil.getMonth() + 1);

  const { error } = await supabase
    .from("users")
    .update({
      plan: "essential",
      plan_activated_at: paidAt.toISOString(),
      plan_paid_until: paidUntil.toISOString()
    })
    .eq("id", userId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    plan: "essential",
    paid_until: paidUntil
  });
});



/* =========================
   ADMIN — EXCEPTION
========================= */
app.post("/admin/trackings/:id/exception", adminAuth, async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const trackingId = req.params.id;
  const { exception_type, severity } = req.body;

  if (!exception_type || !severity) {
    return res.status(400).json({ error: "Dados incompletos" });
  }

  // Busca último status conhecido
  const { data: tracking, error: tErr } = await supabase
    .from("trackings")
    .select("last_status_raw")
    .eq("id", trackingId)
    .single();

  if (tErr) {
    return res.status(500).json({ error: tErr.message });
  }

  const { error } = await supabase
    .from("tracking_exceptions")
    .insert([{
      tracking_id: trackingId,
      exception_type,
      severity,
      status_raw: tracking?.last_status_raw || "-"
    }]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Atualiza tracking principal
// Atualiza tracking principal
await supabase
  .from("trackings")
  .update({
    status: "exception",
    flow_stage: "exception",
    last_checked_at: new Date().toISOString()
  })
  .eq("id", trackingId);


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
   ADMIN — USERS (PAGANTES)
========================= */
app.get("/admin/users", adminAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Supabase indisponível" });
  }

  const { data, error } = await supabase
    .from("users")
    .select(`
      id,
      email,
      plan,
      plan_paid_until,
      created_at,
      trackings(id)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const now = new Date();

  const users = data.map(u => {
    const paidUntil = u.plan_paid_until
      ? new Date(u.plan_paid_until)
      : null;

    const isActive =
      u.plan === "essential" &&
      paidUntil &&
      paidUntil >= now;

    return {
      id: u.id,
      email: u.email,
      plan: u.plan,
      paid_until: u.plan_paid_until,
      status: isActive ? "ATIVO" : "VENCIDO",
      trackings_count: u.trackings?.length || 0
    };
  });

  res.json(users);
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


