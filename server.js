const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WAZZUP_API_KEY = process.env.WAZZUP_API_KEY;

// Главная
app.get("/", (req, res) => {
  res.status(200).send("BIGLINE Wazzup bot is running");
});

// Проверка здоровья
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// Проверка вебхука GET
app.get("/webhook", (req, res) => {
  res.status(200).send("ok");
});

// Диагностический вебхук POST
app.post("/webhook", async (req, res) => {
  try {
    console.log("========== WEBHOOK START ==========");
    console.log(JSON.stringify(req.body, null, 2));

    // Сразу отвечаем Wazzup
    res.status(200).send("ok");

    const body = req.body;

    const candidates = [
      ...(Array.isArray(body?.messages) ? body.messages : []),
      ...(body?.message ? [body.message] : []),
      ...(body?.data ? [body.data] : []),
      body
    ];

    for (const item of candidates) {
      const text =
        item?.text ||
        item?.message?.text ||
        item?.body ||
        item?.content ||
        "";

      const chatId =
        item?.chatId ||
        item?.chat?.id ||
        item?.dialogId ||
        item?.conversationId ||
        null;

      const isFromMe =
        item?.isFromMe ||
        item?.fromMe ||
        false;

      if (!chatId || !text || isFromMe) {
        continue;
      }

      const normalized = String(text).toLowerCase().trim();

      let reply = "";

      if (normalized.includes("смеситель")) {
        reply = `🚿 Смесители — от 4 600 ₸ 🔽
👉 https://bigline.com.kz/catalog/smesiteli_i_komplektuyushchie/`;
      } else if (
        normalized.includes("адрес") ||
        normalized.includes("где вы") ||
        normalized.includes("где магазин")
      ) {
        reply = `📍 Караганда, ул. Затаевича, 87А
📞 +7 775 882 07 91
📞 +7 778 682 55 00`;
      } else if (normalized.includes("менеджер")) {
        reply = `👨‍💼 Передаю вас менеджеру.
📞 +7 775 882 07 91
📞 +7 778 682 55 00`;
      } else {
        reply = `Здравствуйте 👋
Напишите, что вас интересует:
- смеситель
- насос
- труба
- радиатор
- инструмент`;
      }

      await axios.post(
        "https://api.wazzup24.com/v3/message",
        {
          chatId,
          text: reply
        },
        {
          headers: {
            Authorization: `Bearer ${WAZZUP_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      console.log("REPLY SENT:", reply);
    }

    console.log("========== WEBHOOK END ==========");
  } catch (error) {
    console.error(
      "WEBHOOK ERROR:",
      error?.response?.data || error.message
    );
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
