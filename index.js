const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
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

// זיכרון שיחה לכל משתמש
const chats = {};

async function askShlomi(userId, userMessage) {
  if (!chats[userId]) {
    chats[userId] = model.startChat({ history: [] });
  }

  try {
    const result = await chats[userId].sendMessage(userMessage);
    return result.response.text();
  } catch (error) {
    console.error("Gemini API error:", error);
    // אם השיחה נשברה - אפס אותה
    delete chats[userId];
    return "סליחה, נתקלתי בבעיה טכנית. נסה שוב.";
  }
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("\n📱 סרוק את ה-QR הבא עם הוואטסאפ שלך:\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ שלומי מחובר ומוכן לפעולה!");
});

client.on("auth_failure", () => {
  console.error("❌ שגיאת אימות - מחק את תיקיית .wwebjs_auth והפעל מחדש");
});

client.on("message", async (message) => {
  if (message.isGroupMsg) return;
  if (message.fromMe) return;

  const userId = message.from;
  const userText = message.body.trim();

  if (!userText) return;

  console.log(`📩 הודעה מ-${userId}: ${userText}`);

  // פקודת איפוס שיחה
  if (userText === "/reset" || userText === "איפוס") {
    delete chats[userId];
    await message.reply("🔄 השיחה אופסה! מה אפשר לעשות בשבילך?");
    return;
  }

  // פקודת עזרה
  if (userText === "/help" || userText === "עזרה") {
    await message.reply(
      "👋 שלום! אני שלומי, העוזר האישי שלך.\n\n" +
      "✅ שאל אותי כל שאלה\n" +
      "✅ אני זוכר את השיחה שלנו\n\n" +
      "📌 פקודות:\n" +
      "• איפוס — מתחיל שיחה חדשה\n" +
      "• עזרה — מציג את ההודעה הזו"
    );
    return;
  }

  try {
    const chat = await message.getChat();
    await chat.sendStateTyping();

    const reply = await askShlomi(userId, userText);
    await message.reply(reply);

    console.log(`📤 תשובה נשלחה ל-${userId}`);
  } catch (error) {
    console.error("Error:", error);
    await message.reply("אופס, משהו השתבש. נסה שוב.");
  }
});

client.initialize();
