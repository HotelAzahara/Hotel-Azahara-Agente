import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER,
  ANTHROPIC_API_KEY,
  PORT = 3000,
} = process.env;

const SYSTEM_PROMPT = `Eres el agente de WhatsApp del Hotel Azahara, un hotel ubicado en Calle 10 con Calle 11, SM63, Cancún Centro, con servicio las 24 horas los 365 días del año.

INFORMACIÓN DEL HOTEL:
- Habitación sencilla: desde $550 pesos/noche (cama individual, ideal para viajero solo)
- Habitación doble: desde $750 pesos/noche (cama matrimonial o dos camas, ideal para pareja o dos personas)
- Solo ofrecemos estancia (no incluye desayuno, estacionamiento ni servicios adicionales)
- Dirección: Calle 10 con Calle 11, SM63, Cancún Centro

TU FLUJO OBLIGATORIO:
1. Responde saludos o consultas generales con amabilidad y brevedad.
2. Cuando el usuario muestre interés en hospedarse, debes hacer EXACTAMENTE 3 preguntas de cualificación, una a la vez:
   - Pregunta 1: ¿Para qué fechas necesita la habitación?
   - Pregunta 2: ¿Cuántas personas se hospedarán?
   - Pregunta 3: ¿Es su primera vez en el Hotel Azahara?
3. Después de las 3 respuestas, ofrece la habitación más adecuada con precio estimado y propón agendar la estancia.
4. Si preguntan por servicios que NO ofrecemos, informa amablemente que solo ofrecemos estancia.

ESTILO: Cálido, profesional, breve. Máximo 1-2 emojis por mensaje. Responde SIEMPRE en español.`;

const userSessions = new Map();

function getHistory(userId) {
  if (!userSessions.has(userId)) userSessions.set(userId, []);
  return userSessions.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, 2);
}

async function askClaude(userId, userMessage) {
  addToHistory(userId, "user", userMessage);
  const history = getHistory(userId);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: history,
    }),
  });

  const data = await response.json();
  const reply = data.content?.[0]?.text ?? "Lo sentimos, hubo un error. Por favor intenta de nuevo.";
  addToHistory(userId, "assistant", reply);
  return reply;
}

async function sendWhatsAppMessage(to, body) {
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      To: to,
      Body: body,
    }),
  });
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const from = req.body.From;
    const text = req.body.Body;
    if (!from || !text) return;
    console.log(`[${from}] → ${text}`);
    const reply = await askClaude(from, text);
    console.log(`[${from}] ← ${reply}`);
    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error("Error:", err);
  }
});

app.get("/", (req, res) => res.send("Hotel Azahara Agent — OK"));

app.listen(PORT, () => console.log(`Agente escuchando en puerto ${PORT}`));
