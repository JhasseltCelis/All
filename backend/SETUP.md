# Turn on Charles, the AI For You agent

About 20 minutes, one time. You need a Google account and a Telegram account.

When it's done, every client interview reaches you three ways:
* **Email** with a full briefing (summary, top tasks, skill ideas, what to prepare, questions to ask)
* **Google Sheet** called "AI For You clients" (one row per interview, plus a Bookings tab)
* **Telegram** message on your phone

## 1. Get a Claude API key (5 min)

1. Go to https://platform.claude.com and sign up.
2. Add credit under Billing. $10 is plenty to start.
3. Open API Keys, click Create Key, and copy it. Keep it private.

**Cost:** roughly $0.30 to $0.80 per interview. The script stops at 30 interviews a day so nobody can run up your bill.

## 2. Create the script (5 min)

1. Go to https://script.google.com and click **New project**. Name it "AI For You".
2. Delete what's in the editor and paste everything from `backend/Code.gs`.
3. Click the gear icon (**Project Settings**), scroll to **Script Properties**, and add:

| Property | Value |
|---|---|
| ANTHROPIC_API_KEY | the key from step 1 |
| OWNER_EMAIL | the email where you want briefings |

4. Back in the editor, pick **setup** from the function menu and click **Run**. Google asks for permissions: click Allow. This creates your "AI For You clients" sheet in Google Drive.

## 3. Connect Telegram (5 min)

1. In Telegram, open **@BotFather**, send `/newbot`, and follow the steps. Copy the token it gives you.
2. Add a Script Property: **TELEGRAM_BOT_TOKEN** = that token.
3. Open your new bot in Telegram and send it "hi".
4. In the script editor, run **findTelegramChatId**. Copy the number shown in the log.
5. Add a Script Property: **TELEGRAM_CHAT_ID** = that number.
6. Run **testNotifications**. You should get an email and a Telegram message.

## 4. Publish the script (3 min)

1. Click **Deploy**, then **New deployment**.
2. Type: **Web app**. Execute as: **Me**. Who has access: **Anyone**.
3. Click Deploy and copy the **Web app URL**.
4. Send that URL to Claude, or paste it into `website/index.html` at the line `const AFY_API = "";`

That's it. The booking form and the interviewer on your site now work for real.

## Changing things later

* **Daily limit:** add Script Property `DAILY_LIMIT`, for example 50.
* **What the interviewer asks:** edit `INTERVIEW_PROMPT` near the top of the script, then Deploy, Manage deployments, Edit, New version.
* **WhatsApp instead of Telegram:** possible, but it needs a paid WhatsApp Business provider. Ask Claude when you want it.
