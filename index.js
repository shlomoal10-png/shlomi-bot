const { webcrypto } = require("crypto");
globalThis.crypto = webcrypto;

const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction: `אתה שלומי - עוזר אישי חכם ומועיל בוואטסאפ.
אתה עונה בשפה שבה פונים אליך (עברית, אנגלית וכו').
אתה ידידותי, ישיר, ומסביר דברים בצורה ברורה ופשוטה.
אתה יכול לעזור בכל נושא: מידע, חישובים, כתיבה, תרגום, עצות, שאלות כלליות ועוד.
אם לא יודע משהו - אמור זאת בכנות.
שמור תשובות קצרות וממוקדות - זה ווצאפ, לא מאמר.`,
});

const PHONE_NUMBER = process.env.PHONE_NUMBER;
const chats = {};

async function askShlomi(userId, userMessage) {
  if (!chats[userId]) {
    chats[userId] = model.startChat({ history: [] });
  }
  try {
    const result = await chats[userId].sendMessage(userMessage);
    return result.response.text();
  } catch (error) {
    console.error("Gemini error:", error);
    delete chats[userId];
    return "סליחה, נתקלתי בבעיה. נסה שוב.";
  }
}

async function startShlomi() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  let pairingCodeRequested = false;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && !pairingCodeRequested && PHONE_NUMBER) {
      pairingCodeRequested = true;
      try {
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log("=================================");
        console.log("קוד ההצמדה שלך:");
        console.log(code);
        console.log("=================================");
        console.log("פתח וואטסאפ > מכשירים מקושרים > קישור מכשיר > קישור עם מספר טלפון");
      } catch (e) {
        console.error("שגיאה בקבלת קוד:", e);
      }
    }

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startShlomi();
    } else if (connection === "open") {
      console.log("✅ שלומי מחובר ומוכן לפעולה!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;
    if (msg.key.remoteJid.endsWith("@g.us")) return;

    const userId = msg.key.remoteJid;
    const userText =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (!userText.trim()) return;

    if (userText === "איפוס" || userText === "/reset") {
      delete chats[userId];
      await sock.sendMessage(userId, { text: "🔄 השיחה אופסה! מה אפשר לעשות בשבילך?" });
      return;
    }

    if (userText === "עזרה" || userText === "/help") {
      await sock.sendMessage(userId, {
        text: "👋 שלום! אני שלומי, העוזר האישי שלך.\n\n✅ שאל אותי כל שאלה\n✅ אני זוכר את השיחה שלנו\n\n📌 פקודות:\n• איפוס — מתחיל שיחה חדשה\n• עזרה — מציג את ההודעה הזו",
      });
      return;
    }

    try {
      await sock.sendPresenceUpdate("composing", userId);
      const reply = await askShlomi(userId, userText);
      await sock.sendMessage(userId, { text: reply });
    } catch (err) {
      await sock.sendMessage(userId, { text: "אופס, משהו השתבש. נסה שוב." });
    }
  });
}

startShlomi();
