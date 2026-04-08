const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const qrcode = require("qrcode-terminal");

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
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\n📱 סרוק את ה-QR הבא בוואטסאפ:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("התנתק. מתחבר מחדש:", shouldReconnect);
      if (shouldReconnect) startShlomi();
    } else if (connection === "open") {
      console.log("✅ שלומי מחובר ומוכן לפעולה!");
    }
  });

  sock.ev.on("messages.upsert", a
