import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const SYSTEM_PROMPT = `Eres el agente de WhatsApp del Hotel Azahara, ubicado en Calle 10 con Calle 11, SM63, Cancún Centro. Servicio 24 horas.

Habitación sencilla: desde $550 pesos/noche.
Habitación doble: desde $750 pesos/noche.
Solo ofrecemos estancia.

Haz 3 preguntas de cualificación una a la vez cuando alguien quiera hospedarse:
1. Fechas de entrada y salida
2. Número de personas
3. Si es primera visita

Responde siempre en español, de forma breve y amable.`;

const sessions = new Map();

app.post("/webhook", async (req, res) => {
  const from = req.body.From || "";
  const text = req.body.Body || "";
  
  console.log(`Mensaje de ${from}: ${text}`);
  
  if (!sessions.has(from)) sessions.set(from, []);
  const history = sessions.get(from);
  history.push({ role: "user", content: text });
  if (history.length > 20) history.splice(0, 2);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: history,
      }),
    });

    const data = await r.json();
    console.log("Respuesta Claude:", JSON.stringify(data));
    
    const reply = data.content?.[0]?.text || "Gracias por contactarnos. ¿En qué le podemos ayudar?";
    history.push({ role: "assistant", content: reply });
    
    res.set("Content-Type", "text/xml");
    res.send(`<Response><Message>${reply}</Message></Response>`);
  } catch (e) {
    console.error("Error:", e.message);
    res.set("Content-Type", "text/xml");
    res.send(`<Response><Message>Gracias por contactar Hotel Azahara. En un momento le atendemos.</Message></Response>`);
  }
});

app.get("/", (req, res) => res.send("OK"));

app.listen(process.env.PORT || 3000, () => console.log("Servidor iniciado"));
