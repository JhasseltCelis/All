# Turn on Charles, the AI For You agent

About 20 minutes, one time. You need a Google account and a Telegram account.

When it's done, every quick booking and every finished chat with Charles reaches you three ways:
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
| SITE_URL | optional, your website address once it is public, for referral links |

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

## 5. Let Charles chat on Telegram (2 min, free)

1. In the script editor, run **setupTelegramBot**.
2. The log shows your bot's name. Clients who pick Telegram now get an "Open Telegram" button, and Charles chats with them there.
3. Run it again whenever you create a new deployment URL.

## 6. Let Charles chat on WhatsApp (optional, about 1 hour)

This needs a Meta WhatsApp Business account. Until it's set up, WhatsApp leads still reach you by email and Telegram with a one tap link to message them yourself.

1. In Meta for Developers, create an app with **WhatsApp**, and add and verify a phone number for AI For You.
2. Create a message **template** for Charles's first message, for example:
   "Hi {{1}}, I'm Charles, the AI agent at AI For You. Thanks for booking! Can I ask you a few quick questions to prepare your setup?"
   Wait for Meta to approve it.
3. Add Script Properties: **WHATSAPP_TOKEN** (a permanent access token), **WHATSAPP_PHONE_NUMBER_ID**, **WHATSAPP_TEMPLATE** (the template name) and, if it isn't English, **WHATSAPP_TEMPLATE_LANG** (for example `es`).
4. Run **setupWhatsApp**. Paste the Callback URL and Verify token it prints into Meta's WhatsApp webhook settings, and subscribe to **messages**.

**Cost:** replies inside a conversation the client is having are free. Charles's first message (the template) costs a few cents, depending on the country.

**Good to know:** Google Apps Script answers webhooks in an unusual way. Telegram handles it fine. If Meta ever warns that the webhook is failing, tell Claude and we'll add a small free relay in front of it.

## Changing things later

* **Daily limit:** add Script Property `DAILY_LIMIT`, for example 50.
* **What the interviewer asks:** edit `INTERVIEW_PROMPT` near the top of the script, then Deploy, Manage deployments, Edit, New version.
* **See every conversation:** the "Leads" tab in your sheet has each quick booking, its status (new, talking, done) and the chat so far.

## Referral program

Only paying clients can refer. A friend counts when Charles judges them a genuine prospect (real answers, a real need, a paid AI plan or willing to get one, not a developer) and their phone number is confirmed.

1. When a Starter or Pro client has paid, open the **Referrers** tab in your sheet and type their **Name**, **Phone** and **Package**. Leave the other columns empty.
2. Within an hour (or right away if you run **syncReferrers**), their code and share link appear, and you get a message to forward to them.
3. Each genuine prospect with a new, confirmed number adds 1 to **Verified chats**, and you get a message. If Charles says someone wasn't a genuine prospect, you get the reason. Disagree? Add 1 to Verified chats yourself.
4. At 3 (Starter) or 5 (Pro), the Status changes to **refund due** with a refund code, and you get an alert. Send the refund, then type **refunded** in Status.

How numbers are confirmed: WhatsApp chats are confirmed automatically. On Telegram and the website, Charles asks the friend to tap "Share my number" in Telegram. The **Referrals** tab logs every attempt, including the ones that didn't count and why.
