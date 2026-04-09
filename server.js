const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =============================
// ENV
// =============================
const WAZZUP_API_KEY = process.env.WAZZUP_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// =============================
// MEMORY (временная память)
// =============================

// номера, которые переданы менеджеру
const managerModeUsers = new Set();

// чтобы не отвечал сам себе по кругу
const processedMessages = new Set();

// =============================
// BIGLINE BASE
// =============================

const BIGLINE_INFO = {
  city: "Караганда",
  address: "Караганда, ул. Затаевича 87A",
  phone: "+7 778 682 55 00",
  site: "https://bigline.com.kz/",
  workTime: "Пн–Сб: 09:00–18:00\nВоскресенье: выходной"
};

const PRODUCT_LINKS = {
  смеситель: {
    text: "🚿 Смесители — от 4 600 ₸ 🔽\n👉 https://bigline.com.kz/catalog/smesiteli_i_komplektuyushchie/",
  },
  "смеситель для ванной": {
    text: "🚿 Смесители для ванной — от 18 800 ₸ 🔽\n👉 https://bigline.com.kz/catalog/smesiteli_i_komplektuyushchie/smesiteli_dlya_vanny/",
  },
  насос: {
    text: "💧 Насосы — от 18 900 ₸ 🔽\n👉 https://bigline.com.kz/catalog/nasosnoe_oborudovanie/",
  },
  труба: {
    text: "🔧 Трубы и фитинги — от 345 ₸ 🔽\n👉 https://bigline.com.kz/catalog/truby_i_fitingi_/\n👉 https://bigline.com.kz/catalog/radiatory_otopleniya_i_komplektuyushchie_/",
  },
  "труба для отопления": {
    text: "🔧 Трубы для отопления — от 345 ₸ 🔽\n👉 https://bigline.com.kz/catalog/truby_i_fitingi_/\n👉 https://bigline.com.kz/catalog/radiatory_otopleniya_i_komplektuyushchie_/",
  },
  дрель: {
    text: "🛠️ Дрели — смотреть варианты 🔽\n👉 https://bigline.com.kz/catalog/elektroinstrument/",
  },
  перфоратор: {
    text: "🔨 Перфораторы — смотреть варианты 🔽\n👉 https://bigline.com.kz/catalog/elektroinstrument/",
  },
  болгарка: {
    text: "🛠️ Болгарки — смотреть варианты 🔽\n👉 https://bigline.com.kz/catalog/elektroinstrument/",
  },
  "углошлифовальная машина": {
    text: "🛠️ Болгарки — смотреть варианты 🔽\n👉 https://bigline.com.kz/catalog/elektroinstrument/",
  },
  лопата: {
    text: "🧹 Лопаты — смотреть варианты 🔽\n👉 https://bigline.com.kz/",
  }
};

// =============================
// HELPERS
// =============================

function normalizeText(text = "") {
  return text.toLowerCase().trim();
}

function isBotWorkingNow() {
  const now = new Date();

  // Казахстан GMT+5 приближённо
  const options = { timeZone: "Asia/Qyzylorda", weekday: "short", hour: "2-digit", hour12: false };
  const formatter = new Intl.DateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(now);

  const weekday = parts.find(p => p.type === "weekday")?.value || "";
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);

  // Воскресенье = выходной
  if (weekday.toLowerCase().includes("sun")) {
    return false;
  }

  // Бот работает: 18:00–23:59 и 00:00–08:59
  if (hour >= 18 || hour < 9) {
    return true;
  }

  return false;
}

function isWorkingHoursQuestion(text) {
  return [
    "до скольки",
    "режим работы",
    "график",
    "во сколько закрываетесь",
    "работаете",
    "воскресенье",
    "когда работаете"
  ].some(k => text.includes(k));
}

function isAddressQuestion(text) {
  return [
    "адрес",
    "где вы",
    "где находитесь",
    "как вас найти",
    "локация"
  ].some(k => text.includes(k));
}

function wantsManager(text) {
  return [
    "менеджер",
    "оператор",
    "человек",
    "живой",
    "соедините",
    "позовите менеджера",
    "хочу с менеджером",
    "хочу с человеком"
  ].some(k => text.includes(k));
}

function wantsBotBack(text) {
  return [
    "бот",
    "вернуть бота",
    "снова бот",
    "пусть бот ответит"
  ].some(k => text.includes(k));
}

function findCatalogReply(text) {
  // Сначала более точные ключи
  const orderedKeys = Object.keys(PRODUCT_LINKS).sort((a, b) => b.length - a.length);

  for (const key of orderedKeys) {
    if (text.includes(key)) {
      return PRODUCT_LINKS[key].text;
    }
  }

  return null;
}

async function sendWazzupMessage(chatId, text) {
  try {
    await axios.post(
      "https://api.wazzup24.com/v3/message",
      {
        chatId,
        text
      },
      {
        headers: {
          Authorization: `Bearer ${WAZZUP_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("Wazzup send error:", error.response?.data || error.message);
  }
}

async function askOpenAI(userText) {
  const systemPrompt = `
Ты — ИИ-консультант компании BIGLINE.

Правила:
1. Отвечай кратко, по делу, без воды.
2. Если спрашивают товар — сначала давай минимальную цену "от", если знаешь.
3. Всегда старайся давать ссылку на категорию BIGLINE.
4. Не предлагай опт.
5. Не пиши "могу показать варианты".
6. Если не уверен — направляй к менеджеру.
7. Город по умолчанию: Караганда.
8. Адрес: ${BIGLINE_INFO.address}
9. Телефон: ${BIGLINE_INFO.phone}
10. Сайт: ${BIGLINE_INFO.site}
11. График:
${BIGLINE_INFO.workTime}

Стиль:
- коротко
- понятно
- с эмодзи в тему
- без лишней болтовни
`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices?.[0]?.message?.content?.trim() || "Напишите подробнее, и я помогу 👌";
  } catch (error) {
    console.error("OpenAI error:", error.response?.data || error.message);
    return "Не удалось обработать запрос. Напишите «менеджер», и вас подключат 👤";
  }
}

// =============================
// ROUTES
// =============================

app.get("/", (req, res) => {
  res.send("BIGLINE Wazzup bot is running");
});

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

app.get("/webhook", (req, res) => {
  res.status(200).send("ok");
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("Webhook body:", JSON.stringify(body, null, 2));

    // Wazzup иногда шлёт разные структуры
    const message = body?.message || body?.messages?.[0] || body;

    const chatId = message?.chatId;
    const text = message?.text || "";
    const messageId = message?.messageId || message?.id || "";
    const isFromMe = message?.isFromMe || false;

    if (!chatId || !text) {
      return res.status(200).send("ok");
    }

    // чтобы бот не отвечал на свои же сообщения
    if (isFromMe) {
      return res.status(200).send("ok");
    }

    if (messageId && processedMessages.has(messageId)) {
      return res.status(200).send("ok");
    }

    if (messageId) {
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 1000 * 60 * 10);
    }

    const normalized = normalizeText(text);

    // =========================
    // HANDOFF TO MANAGER
    // =========================
    if (wantsManager(normalized)) {
      managerModeUsers.add(chatId);

      await sendWazzupMessage(
        chatId,
        "👤 Передаю вас менеджеру.\nПожалуйста, ожидайте ответа."
      );

      return res.status(200).send("ok");
    }

    // =========================
    // RETURN BOT BACK
    // =========================
    if (wantsBotBack(normalized)) {
      if (managerModeUsers.has(chatId)) {
        managerModeUsers.delete(chatId);

        await sendWazzupMessage(
          chatId,
          "🤖 Бот снова подключен.\nМожете писать вопрос."
        );
      }

      return res.status(200).send("ok");
    }

    // если чат передан менеджеру — бот молчит
    if (managerModeUsers.has(chatId)) {
      return res.status(200).send("ok");
    }

    // =========================
    // WORKTIME / ADDRESS
    // =========================
    if (isWorkingHoursQuestion(normalized)) {
      await sendWazzupMessage(
        chatId,
        `🕘 Работаем до 18:00\n\nЕжедневно: 09:00–18:00\n❌ Воскресенье: выходной\n\n📍 ${BIGLINE_INFO.address}\n📞 ${BIGLINE_INFO.phone}\n👉 ${BIGLINE_INFO.site}`
      );
      return res.status(200).send("ok");
    }

    if (isAddressQuestion(normalized)) {
      await sendWazzupMessage(
        chatId,
        `📍 ${BIGLINE_INFO.address}\n📞 ${BIGLINE_INFO.phone}\n🕘 Пн–Сб: 09:00–18:00\n❌ Воскресенье: выходной\n👉 ${BIGLINE_INFO.site}`
      );
      return res.status(200).send("ok");
    }

    // =========================
    // WORKING SCHEDULE FOR BOT
    // =========================
    if (!isBotWorkingNow()) {
      return res.status(200).send("ok");
    }

    // =========================
    // FAST PRODUCT REPLIES
    // =========================
    const quickReply = findCatalogReply(normalized);
    if (quickReply) {
      await sendWazzupMessage(chatId, quickReply);
      return res.status(200).send("ok");
    }

    // =========================
    // FALLBACK TO OPENAI
    // =========================
    const aiReply = await askOpenAI(text);
    await sendWazzupMessage(chatId, aiReply);

    return res.status(200).send("ok");
  } catch (error) {
    console.error("Webhook error:", error.response?.data || error.message);
    return res.status(200).send("ok");
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
