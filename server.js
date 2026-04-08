import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WAZZUP_API_KEY = process.env.WAZZUP_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function isAiWorkingNow() {
  const now = new Date();
  const kzNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Almaty" })
  );

  const day = kzNow.getDay(); // 0 = Sunday
  const hour = kzNow.getHours();

  if (day === 0) return true; // Sunday full day
  if (hour >= 18 || hour < 9) return true; // Mon-Sat 18:00-09:00

  return false;
}

async function askOpenAI(userMessage) {
  const systemPrompt = `
Ты — ИИ-продавец-консультант компании BIGLINE.
Отвечай коротко, по делу, как продавец-консультант.
Если вопрос сложный, если нужна точная цена, точное наличие, остатки, скидка, подбор, совместимость или клиент просит человека — передавай на менеджера:

👨‍💼 Этот вопрос лучше быстро уточнить у менеджера BIGLINE 🔽

📞 Телефоны:
+7 775 882 07 91
+7 778 682 55 00

📍 Караганда, ул. Затаевича, 87А
`;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.2
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data.choices[0].message.content.trim();
}

async function sendMessageToWazzup({ channelId, chatType, chatId, text }) {
  await axios.post(
    "https://api.wazzup24.com/v3/message",
    {
      channelId,
      chatType,
      chatId,
      text,
      clearUnanswered: false
    },
    {
      headers: {
        Authorization: `Bearer ${WAZZUP_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
}

app.post("/webhook", async (req, res) => {
  try {
    if (req.body?.test) {
      return res.status(200).send("ok");
    }

    const messages = req.body?.messages || [];
    res.status(200).send("ok");

    for (const msg of messages) {
      if (msg.status !== "inbound") continue;
      if (!msg.text) continue;

      if (!isAiWorkingNow()) {
        console.log("Рабочее время менеджеров — бот не отвечает");
        continue;
      }

      const aiReply = await askOpenAI(msg.text);

      await sendMessageToWazzup({
        channelId: msg.channelId,
        chatType: msg.chatType,
        chatId: msg.chatId,
        text: aiReply
      });

      console.log("Ответ отправлен:", aiReply);
    }
  } catch (error) {
    console.error("Ошибка:", error?.response?.data || error.message);
  }
});

app.get("/", (req, res) => {
  res.send("BIGLINE Wazzup bot is running");
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
