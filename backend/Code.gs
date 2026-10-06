/**
 * AI For You backend (Google Apps Script web app)
 *
 * Runs the AI intake interview with Claude, then sends the consultant a
 * summary by email, saves it to a Google Sheet and posts it to Telegram.
 * Also receives booking requests from the website.
 *
 * Settings live in Project Settings > Script Properties (never in this file):
 *   ANTHROPIC_API_KEY   required
 *   OWNER_EMAIL         where summaries are emailed
 *   TELEGRAM_BOT_TOKEN  optional, from @BotFather
 *   TELEGRAM_CHAT_ID    optional, run findTelegramChatId() to get it
 *   DAILY_LIMIT         optional, max interviews per day (default 30)
 *   SHEET_ID            filled in automatically by setup()
 *
 * Charles on Telegram (free): run setupTelegramBot() after deploying.
 * Charles on WhatsApp (needs a Meta WhatsApp Business account):
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE (approved opener,
 *   one {{1}} variable for the first name), WHATSAPP_TEMPLATE_LANG (default en),
 *   then run setupWhatsApp() for the webhook details.
 */

const MODEL = 'claude-opus-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TURNS = 40;          // client messages per interview
const MAX_CHARS = 2000;        // per client message
const TOPICS = ['role', 'ai_today', 'tasks', 'tools', 'style', 'privacy', 'schedule'];
const GRAPH_VERSION = 'v23.0';  // Meta Graph API version for WhatsApp; update if Meta retires it

const INTERVIEW_PROMPT = `You are Charles, the AI intake agent for AI For You, a service where a consultant sets up Claude, ChatGPT or Gemini for busy professionals who are not technical. You are talking with a new client before their setup call.

Your goal: in about 10 minutes, learn what the consultant needs to prepare a great setup. Cover these topics:
- role: their job, industry and what a normal workday looks like
- ai_today: which AI tools and plans they already have, how often they use them, what frustrates them
- tasks: the 3 repetitive tasks that take most of their time, with enough concrete detail to build a custom skill or GPT for each
- tools: email, calendar, file storage, chat, CRM and devices they work with
- style: how they write, tone, languages, words or habits to avoid
- privacy: information AI must never touch, and any company rules about AI
- schedule: preferred days and times for the setup call, their time zone, and which AI they want set up (Claude, ChatGPT or Gemini)

How to talk:
- Introduce yourself as Charles, the AI agent at AI For You, in your first message. If asked, be clear that you are an AI, not a person.
- One question per message. Short, warm, plain words. Under 60 words.
- When an answer is vague, ask one follow up for a concrete example before moving on.
- Reply in the language the client writes in.
- Never ask for passwords, API keys, card numbers or similar. If the client starts sharing one, tell them kindly not to and continue.
- Do not give setup advice or recommend products. If asked, say the consultant will cover it in the session.
- If the client wants to stop early, wrap up politely.
- Some people come through a friend's referral code. They don't have to buy anything: run the interview normally, and their finished chat counts for their friend.
- The service needs a paid AI plan. If they're on a free plan, mention kindly that they'll need to upgrade before the session, and that the consultant will help them pick. If they turn out to be a developer or very technical, be honest that they may not need the service, and let the consultant decide.

When every topic is covered well enough, or the client wants to stop, thank them, tell them the consultant will review their answers before the session, and set done to true.

Output fields: message is what the client sees. covered lists every topic covered so far. done is true only on your final message.`;

const SUMMARY_PROMPT = `You prepare briefings for a consultant who sets up Claude, ChatGPT and Gemini for clients. Read the intake interview below and write the briefing the consultant will use to prepare the setup session. Be specific and practical. Use only what the client said; write "not mentioned" when something is missing. The service needs a paid AI plan and is not meant for developers or very technical people: set fit_warning to a short note if the client is on a free plan or seems too technical to need help, otherwise "none". Packages, for recommended_package: Starter ($100) sets up one AI tool with custom instructions and the right connections; Pro ($200) adds custom skills, GPTs or Gems, plugins and ad hoc tools for repeat work, across up to 3 AI tools, plus a tune up; Team ($500) covers up to 5 people with shared skills and training. Set qualified_prospect to true only if the person engaged meaningfully: specific, honest answers about their real work and tasks, a genuine need this service can solve, a paid AI plan or a clear willingness to get one, and not a developer or very technical person. Short, vague, joking or copied answers, or someone just going through the motions, are not qualified. Explain your decision in one sentence in qualification_reason. The client recap is shown to the client, so write it in their language, warmly, in 2 or 3 sentences. Everything else is for the consultant, in English.`;

// ---------- Web entry points ----------

function doPost(e) {
  try {
    const q = e.parameter || {};
    if (q.tg) return handleTelegramUpdate(q.tg, JSON.parse(e.postData.contents));
    if (q.wa) return handleWhatsAppUpdate(q.wa, JSON.parse(e.postData.contents));
    const req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'lead': return json(handleLead(req));
      case 'chat': return json(handleChat(req));
      case 'finish': return json(handleFinish(req));
      case 'booking': return json(handleBooking(req));
      default: return json({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server_error' });
  }
}

function doGet(e) {
  const q = (e && e.parameter) || {};
  // Meta checks the WhatsApp webhook with a GET before sending messages
  if (q['hub.mode'] === 'subscribe') {
    const ok = q['hub.verify_token'] && q['hub.verify_token'] === prop('WHATSAPP_VERIFY_TOKEN');
    return ContentService.createTextOutput(ok ? q['hub.challenge'] : 'forbidden');
  }
  return json({ ok: true, service: 'ai-for-you' });
}

// ---------- Interview ----------

function handleChat(req) {
  const name = clean(req.name, 80);
  const history = sanitizeHistory(req.messages, true);
  if (!history.ok) return { ok: false, error: history.error };

  // The first call has an empty history: that's a new interview
  if (history.messages.length === 0 && !takeDailySlot()) {
    return { ok: false, error: 'daily_limit' };
  }
  if (history.messages.length && history.messages[history.messages.length - 1].role !== 'user') {
    return { ok: false, error: 'invalid' };
  }

  return interviewTurn(name, history.messages, 'website chat');
}

// One interview turn, shared by the website chat, Telegram and WhatsApp
function interviewTurn(name, history, context) {
  const messages = [
    { role: 'user', content: 'The client ' + (name || '') + ' has opened the interview (' + context + '). Greet them by first name and ask your first question.' }
  ].concat(history);

  const schema = {
    type: 'object',
    properties: {
      message: { type: 'string' },
      covered: { type: 'array', items: { type: 'string', enum: TOPICS } },
      done: { type: 'boolean' }
    },
    required: ['message', 'covered', 'done'],
    additionalProperties: false
  };

  const out = callClaude({
    system: INTERVIEW_PROMPT,
    messages: messages,
    max_tokens: 4000,
    effort: 'low',
    schema: schema
  });
  if (!out.ok) return out;
  return { ok: true, message: out.data.message, covered: out.data.covered, done: out.data.done };
}

function handleFinish(req) {
  const history = sanitizeHistory(req.messages);
  if (!history.ok) return { ok: false, error: history.error };
  const name = clean(req.name, 80), contact = clean(req.email, 120), ref = cleanCode(req.ref);
  const out = finishInterview(name, contact, history.messages, 'website');
  if (!out.ok || !ref) return out;
  // Website chats can't prove the phone number, so the friend confirms it on Telegram
  const lead = newLead(name, digits(contact).length >= 7 ? contact : '', 'website', ref, 'done');
  setLeadField(lead, 'Qualified prospect', (out.qualified ? 'yes: ' : 'no: ') + out.qualReason);
  const bot = prop('TELEGRAM_BOT_USERNAME');
  if (bot) out.verifyLink = 'https://t.me/' + bot + '?start=v_' + lead.id;
  return out;
}

// Summarize an interview and deliver the briefing; contact is an email or phone
function finishInterview(name, email, history, channel) {
  const transcript = history
    .map(m => (m.role === 'user' ? 'CLIENT: ' : 'INTERVIEWER: ') + m.content)
    .join('\n\n');

  const schema = {
    type: 'object',
    properties: {
      one_line: { type: 'string' },
      language: { type: 'string' },
      role: { type: 'string' },
      industry: { type: 'string' },
      current_ai: { type: 'string' },
      plan_status: { type: 'string', enum: ['Paid', 'Top tier', 'Free, must upgrade', 'Unknown'] },
      fit_warning: { type: 'string' },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: { task: { type: 'string' }, detail: { type: 'string' }, skill_idea: { type: 'string' } },
          required: ['task', 'detail', 'skill_idea'],
          additionalProperties: false
        }
      },
      tools_to_connect: { type: 'array', items: { type: 'string' } },
      writing_style: { type: 'string' },
      privacy_limits: { type: 'string' },
      company_rules: { type: 'string' },
      preferred_times: { type: 'string' },
      recommended_package: { type: 'string', enum: ['Starter', 'Pro', 'Team', 'Unsure'] },
      package_reason: { type: 'string' },
      session_plan: { type: 'array', items: { type: 'string' } },
      prep_checklist: { type: 'array', items: { type: 'string' } },
      open_questions: { type: 'array', items: { type: 'string' } },
      client_recap: { type: 'string' },
      qualified_prospect: { type: 'boolean' },
      qualification_reason: { type: 'string' }
    },
    required: ['one_line', 'language', 'role', 'industry', 'current_ai', 'plan_status', 'fit_warning', 'tasks', 'tools_to_connect', 'writing_style',
      'privacy_limits', 'company_rules', 'preferred_times', 'recommended_package', 'package_reason', 'session_plan', 'prep_checklist',
      'open_questions', 'client_recap', 'qualified_prospect', 'qualification_reason'],
    additionalProperties: false
  };

  const out = callClaude({
    system: SUMMARY_PROMPT,
    messages: [{ role: 'user', content: 'Client name: ' + name + '\nClient contact: ' + email + '\nChannel: ' + channel + '\n\nInterview:\n\n' + transcript }],
    max_tokens: 12000,
    effort: 'medium',
    schema: schema
  });
  if (!out.ok) return out;
  const s = out.data;

  saveInterview(name, email, s, transcript);
  notifyOwner(
    'New intake: ' + name + ' (' + s.recommended_package + ', via ' + channel + ')',
    briefingText(name, email, s),
    briefingHtml(name, email, s, transcript)
  );
  return { ok: true, recap: s.client_recap, qualified: !!s.qualified_prospect, qualReason: s.qualification_reason };
}

// ---------- Booking ----------

function handleBooking(req) {
  const b = {
    name: clean(req.name, 80),
    email: clean(req.email, 120),
    phone: clean(req.phone, 40),
    pkg: clean(req.package, 40),
    plan: clean(req.plan, 60),
    ai: clean([].concat(req.ai || []).join(', '), 120),
    date: clean(req.date, 20),
    time: clean(req.time, 20),
    notes: clean(req.notes, 1500)
  };
  if (!b.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return { ok: false, error: 'invalid' };

  sheet('Bookings', ['Received', 'Name', 'Email', 'Phone', 'Package', 'AI plan', 'AI', 'Date', 'Time', 'Notes'])
    .appendRow([new Date(), b.name, b.email, b.phone, b.pkg, b.plan, b.ai, b.date, b.time, b.notes]);

  const text = 'New booking request\n\n' + b.name + ' (' + b.email + (b.phone ? ', ' + b.phone : '') + ')\n' +
    'Package: ' + b.pkg + '\nAI plan: ' + (b.plan || 'not given') + (b.plan === 'Free' ? '  (needs to upgrade before the session)' : '') + '\nAI: ' + (b.ai || 'not chosen') + '\nWhen: ' + (b.date || 'any day') + ', ' + b.time +
    (b.notes ? '\n\nNotes: ' + b.notes : '');
  notifyOwner('New booking: ' + b.name, text, '<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">' + esc(text) + '</pre>');
  return { ok: true };
}


// ---------- Quick lead: name, phone, package, then Charles follows up ----------

const LEAD_HEADERS = ['Received', 'Id', 'Name', 'Phone', 'Package', 'Channel', 'Status', 'Chat id', 'Covered', 'History', 'Referral code', 'Verified phone', 'Qualified prospect'];

function handleLead(req) {
  const lead = {
    name: clean(req.name, 80),
    phone: clean(req.phone, 40),
    pkg: clean(req.package, 40),
    channel: req.channel === 'telegram' ? 'telegram' : 'whatsapp',
    ref: cleanCode(req.ref)
  };
  if (!lead.name || digits(lead.phone).length < 7) return { ok: false, error: 'invalid' };
  lead.id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  sheet('Leads', LEAD_HEADERS).appendRow([new Date(), lead.id, lead.name, lead.phone, lead.pkg, lead.channel, 'new', '', '', '[]', lead.ref, '', '']);

  const out = { ok: true, channel: lead.channel };
  let how;
  if (lead.channel === 'telegram') {
    const bot = prop('TELEGRAM_BOT_USERNAME');
    if (bot) out.telegramLink = 'https://t.me/' + bot + '?start=' + lead.id;
    how = 'Telegram. Charles starts as soon as they open the link.';
  } else {
    out.whatsappAuto = waConfigured() && waSendTemplate(lead.phone, lead.name.split(' ')[0]);
    if (out.whatsappAuto) setLeadField(findLead(l => l.id === lead.id), 'Status', 'contacted');
    how = out.whatsappAuto ? 'WhatsApp. Charles sent the first message.'
      : 'WhatsApp. Charles is not connected to WhatsApp yet, so message them yourself: https://wa.me/' + digits(lead.phone);
  }
  const text = 'New lead: ' + lead.name + ', ' + lead.phone + '\nPackage: ' + (lead.pkg || 'not sure') + '\nWants to talk on ' + how + (lead.ref ? '\nReferral code: ' + lead.ref : '');
  notifyOwner('New lead: ' + lead.name, text, '<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">' + esc(text) + '</pre>');
  return out;
}

// ---------- Referral program ----------
// Paying Starter and Pro clients get a code. Each friend who finishes a chat with
// Charles from a new, verified phone number counts. Starter needs 3, Pro needs 5,
// then the client gets the package price back. Team is not eligible.

const REFERRER_HEADERS = ['Added', 'Name', 'Phone', 'Package', 'Code', 'Share link', 'Goal', 'Verified chats', 'Status', 'Refund code'];
const REFERRAL_LOG_HEADERS = ['Date', 'Code', 'Friend', 'Phone', 'Channel', 'Result'];
const REFERRAL_GOALS = { starter: 3, pro: 5 };
const REFERRAL_PRICES = { starter: '$100', pro: '$200' };

// Fills in codes for rows you added to the Referrers tab (just Name, Phone and Package)
function syncReferrers() {
  const sh = sheet('Referrers', REFERRER_HEADERS);
  const rows = sh.getDataRange().getValues();
  const used = rows.slice(1).map(r => String(r[4])).filter(Boolean);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[1] || r[4] || r[8]) continue;
    const pkg = String(r[3]).trim().toLowerCase();
    if (!REFERRAL_GOALS[pkg]) {
      sh.getRange(i + 1, 9).setValue('not eligible (' + (r[3] || 'no package') + ')');
      continue;
    }
    let code;
    const prefix = String(r[1]).replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'AFY';
    do { code = prefix + '-' + randomChars(4); } while (used.indexOf(code) >= 0);
    used.push(code);
    const site = prop('SITE_URL');
    const bot = prop('TELEGRAM_BOT_USERNAME');
    const link = site ? site + (site.indexOf('?') >= 0 ? '&' : '?') + 'ref=' + code : (bot ? 'https://t.me/' + bot + '?start=r_' + code.replace(/-/g, '_') : '');
    sh.getRange(i + 1, 1, 1, 10).setValues([[r[0] || new Date(), r[1], r[2], r[3], code, link, REFERRAL_GOALS[pkg], 0, 'active', '']]);
    const text = 'Referral code ready for ' + r[1] + ' (' + r[3] + '): ' + code +
      '\nGoal: ' + REFERRAL_GOALS[pkg] + ' friends finish a chat with Charles, then ' + REFERRAL_PRICES[pkg] + ' back.' +
      (link ? '\nShare link: ' + link : '') + '\nSend this to your client.';
    notifyOwner('Referral code for ' + r[1] + ': ' + code, text, '<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">' + esc(text) + '</pre>');
  }
}

function countReferral(lead, phone, channel) {
  syncReferrers();
  const log = (result) => sheet('Referrals', REFERRAL_LOG_HEADERS).appendRow([new Date(), lead.ref, lead.name, phone, channel, result]);
  const sh = sheet('Referrers', REFERRER_HEADERS);
  const rows = sh.getDataRange().getValues();
  let row = -1;
  for (let i = 1; i < rows.length; i++) if (String(rows[i][4]).toUpperCase() === lead.ref) row = i;
  const thanks = 'Thanks for chatting with me, ' + lead.name.split(' ')[0] + '.';
  if (row < 0) { log('unknown code'); return { counted: false, message: thanks + ' That referral code did not match anyone, so this chat could not be counted.' }; }
  const ref = rows[row], friend = String(ref[1]).split(' ')[0];
  if (String(ref[8]) !== 'active') { log('not counted: ' + ref[8]); return { counted: false, message: thanks + ' ' + friend + ' has already reached their goal. Nice work, both of you.' }; }
  if (samePhone(phone, ref[2])) { log('not counted: own number'); return { counted: false, message: thanks + ' This number belongs to the code owner, so it does not count.' }; }
  const seen = sheet('Referrals', REFERRAL_LOG_HEADERS).getDataRange().getValues().slice(1)
    .some(r => String(r[5]) === 'counted' && samePhone(r[3], phone));
  const isClient = rows.slice(1).some(r => samePhone(r[2], phone));
  if (seen || isClient) { log('not counted: number already used'); return { counted: false, message: thanks + ' This number has already been counted before, so it can not count again.' }; }
  // Only genuine prospects count; the consultant gets the reason and can override
  if (String(lead.qualified).indexOf('yes') !== 0) {
    log('not counted: not a qualified prospect (' + String(lead.qualified).replace(/^no: /, '') + ')');
    const t = lead.ref + ' (' + ref[1] + '): ' + lead.name + ' finished a chat but Charles did not see a genuine prospect.\nReason: ' + String(lead.qualified).replace(/^no: /, '') +
      '\nIf you disagree, add 1 to Verified chats in the Referrers tab yourself.';
    notifyOwner('Referral not counted for ' + ref[1], t, '<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">' + esc(t) + '</pre>');
    return { counted: false, message: thanks + ' Your consultant will review your answers and be in touch.' };
  }

  log('counted');
  const count = Number(ref[7] || 0) + 1, goal = Number(ref[6]);
  sh.getRange(row + 1, 8).setValue(count);
  let text = lead.ref + ' (' + ref[1] + '): ' + count + ' of ' + goal + ' verified chats. Latest: ' + lead.name + ', ' + phone + ', via ' + channel + '.';
  if (count >= goal) {
    const refund = 'REFUND-' + lead.ref + '-' + randomChars(4);
    sh.getRange(row + 1, 9, 1, 2).setValues([['refund due', refund]]);
    text += '\n\nGoal reached. ' + ref[1] + ' gets ' + (REFERRAL_PRICES[String(ref[3]).toLowerCase()] || 'their package') + ' back. Refund code: ' + refund +
      '\nSend them the code and the refund, then set Status to "refunded".';
    notifyOwner('Refund due: ' + ref[1] + ' reached ' + goal + ' referrals', text, '<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">' + esc(text) + '</pre>');
  } else {
    notifyOwner('Referral counted for ' + ref[1] + ' (' + count + ' of ' + goal + ')', text, '<p>' + esc(text) + '</p>');
  }
  return { counted: true, message: thanks + ' Your chat counts for ' + friend + ': that is ' + count + ' of ' + goal + '.' };
}

function cleanCode(v) { const c = String(v || '').trim().toUpperCase(); return /^[A-Z]{1,8}-[A-Z0-9]{4}$/.test(c) ? c : ''; }
function randomChars(n) { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

// ---------- Charles in messaging apps ----------

function handleTelegramUpdate(secret, update) {
  if (secret !== prop('TELEGRAM_WEBHOOK_SECRET')) return json({ ok: false });
  if (seenBefore('tg' + update.update_id)) return json({ ok: true });
  const m = update.message;
  if (!m || !m.chat || String(m.chat.id) === String(prop('TELEGRAM_CHAT_ID'))) return json({ ok: true });
  const chatId = String(m.chat.id);
  const send = text => tgSend(chatId, text);
  const firstName = (m.from && m.from.first_name) || 'there';

  // Referral check: the friend shares their own number with one tap
  if (m.contact) {
    const lead = findLead(l => l.chatId === chatId && l.ref && !l.verified);
    if (!lead) { tgSend(chatId, 'Thanks, nothing to confirm right now.', { remove_keyboard: true }); return json({ ok: true }); }
    if (!m.from || String(m.contact.user_id) !== String(m.from.id)) { send('Please share your own number with the button, not a saved contact.'); return json({ ok: true }); }
    withLock(() => {
      setLeadField(lead, 'Verified phone', m.contact.phone_number);
      tgSend(chatId, countReferral(lead, m.contact.phone_number, 'Telegram').message, { remove_keyboard: true });
    });
    return json({ ok: true });
  }
  if (typeof m.text !== 'string') { send('I can only read text messages for now.'); return json({ ok: true }); }

  let lead, text = m.text.trim();
  const start = text.match(/^\/start(?:\s+(\w+))?/);
  const param = start && start[1] ? start[1] : '';
  if (param.indexOf('v_') === 0) {
    // A website chat came here only to confirm the number for a referral
    lead = findLead(l => l.id === param.slice(2));
    if (!lead || !lead.ref || lead.verified) { send('Thanks! There is nothing to confirm on this link.'); return json({ ok: true }); }
    setLeadField(lead, 'Chat id', chatId);
    askForNumber(chatId, firstName);
    return json({ ok: true });
  }
  if (start) {
    lead = param && param.indexOf('r_') !== 0 ? findLead(l => l.id === param) : null;
    if (!lead) lead = findLead(l => l.chatId === chatId && l.status !== 'done');
    if (!lead) lead = newLead(firstName, '', 'telegram', param.indexOf('r_') === 0 ? cleanCode(param.slice(2).replace(/_/g, '-')) : '');
    setLeadField(lead, 'Chat id', chatId);
    lead.chatId = chatId;
    text = null; // /start is not an answer
  } else {
    lead = findLead(l => l.chatId === chatId && l.status !== 'done') || findLead(l => l.chatId === chatId);
    if (!lead) { lead = newLead(firstName, '', 'telegram'); setLeadField(lead, 'Chat id', chatId); lead.chatId = chatId; }
  }
  withLock(() => converse(findLead(l => l.id === lead.id) || lead, text, send, 'Telegram'));
  return json({ ok: true });
}

function handleWhatsAppUpdate(secret, body) {
  if (secret !== prop('WHATSAPP_WEBHOOK_SECRET')) return json({ ok: false });
  (body.entry || []).forEach(entry => (entry.changes || []).forEach(ch => {
    const v = ch.value || {};
    (v.messages || []).forEach(m => {
      if (seenBefore('wa' + m.id)) return;
      const from = digits(m.from);
      const send = text => waSendText(from, text);
      if (m.type !== 'text') { send('I can only read text messages for now.'); return; }
      const profile = (v.contacts || []).filter(c => c.wa_id === m.from)[0];
      let lead = findLead(l => samePhone(l.phone, from) && l.status !== 'done') || findLead(l => samePhone(l.phone, from));
      if (!lead) lead = newLead(profile && profile.profile ? profile.profile.name : 'there', from, 'whatsapp');
      const id = lead.id;
      withLock(() => converse(findLead(l => l.id === id), m.text.body, send, 'WhatsApp'));
    });
  }));
  return json({ ok: true });
}

// Shared conversation loop for messaging apps
function converse(lead, userText, send, channel) {
  if (lead.status === 'done') {
    send('Thanks again, ' + lead.name.split(' ')[0] + '. Your consultant has your notes and will confirm your session. If something changed, just tell me here and I will pass it on.');
    if (userText) notifyOwner('Message from ' + lead.name, lead.name + ' wrote after the interview (' + channel + '):\n\n' + userText, '<p>' + esc(userText) + '</p>');
    return;
  }
  const history = lead.history;
  if (!history.length && !takeDailySlot()) { send('Sorry, I am fully booked today. Your consultant will contact you directly.'); return; }
  if (userText && !lead.ref) {
    const code = String(userText).toUpperCase().match(/\b[A-Z]{2,8}-[A-Z0-9]{4}\b/);
    if (code) { lead.ref = code[0]; setLeadField(lead, 'Referral code', code[0]); }
  }
  if (userText) {
    if (!history.length) history.push({ role: 'assistant', content: 'Hi ' + lead.name.split(' ')[0] + ', I am Charles, the AI agent at AI For You.' });
    history.push({ role: 'user', content: clean(userText, MAX_CHARS) });
  }
  if (history.filter(h => h.role === 'user').length > MAX_TURNS) { finishLead(lead, send, channel); return; }

  const context = channel + ', after a quick booking for the ' + (lead.pkg || 'undecided') + ' package';
  const r = interviewTurn(lead.name, history, context);
  if (!r.ok) { send('Sorry, I had a problem on my side. Please send that again in a minute.'); return; }
  history.push({ role: 'assistant', content: r.message });
  send(r.message);
  lead.covered = Array.from(new Set(lead.covered.concat(r.covered || [])));
  saveLeadState(lead, 'talking');
  if (r.done) finishLead(lead, send, channel);
}

function finishLead(lead, send, channel) {
  const contact = lead.phone || ('Telegram chat ' + lead.chatId);
  const r = finishInterview(lead.name, contact, lead.history, channel);
  if (r.ok) send(r.recap);
  saveLeadState(lead, 'done');
  if (!lead.ref || !r.ok) return;
  lead.qualified = (r.qualified ? 'yes: ' : 'no: ') + r.qualReason;
  setLeadField(lead, 'Qualified prospect', lead.qualified);
  if (channel === 'WhatsApp') {
    // WhatsApp messages come from the real number, so it is already verified
    setLeadField(lead, 'Verified phone', lead.phone);
    send(countReferral(lead, lead.phone, channel).message);
  } else if (channel === 'Telegram') {
    askForNumber(lead.chatId, lead.name.split(' ')[0]);
  }
}

function askForNumber(chatId, firstName) {
  tgSend(chatId, 'One last thing, ' + firstName + ': tap the button below to confirm your number. That is how your chat counts for the friend who referred you.', {
    keyboard: [[{ text: 'Share my number', request_contact: true }]], one_time_keyboard: true, resize_keyboard: true
  });
}

// ---------- Lead storage (Leads tab in the sheet) ----------

function findLead(match) {
  const sh = sheet('Leads', LEAD_HEADERS);
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    const r = rows[i];
    let history = [];
    try { history = JSON.parse(r[9] || '[]'); } catch (e) {}
    const lead = { row: i + 1, id: String(r[1]), name: String(r[2]), phone: String(r[3]), pkg: String(r[4]), channel: String(r[5]),
      status: String(r[6]), chatId: String(r[7]), covered: String(r[8] || '').split(',').filter(Boolean), history: history,
      ref: String(r[10] || ''), verified: String(r[11] || ''), qualified: String(r[12] || '') };
    if (match(lead)) return lead;
  }
  return null;
}

function newLead(name, phone, channel, ref, status) {
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  sheet('Leads', LEAD_HEADERS).appendRow([new Date(), id, name, phone, '', channel, status || 'new', '', '', '[]', ref || '', '', '']);
  notifyOwner('New chat with Charles: ' + name, name + ' started talking to Charles on ' + channel + (phone ? ' (' + phone + ')' : '') + '.', '<p>' + esc(name) + ' started talking to Charles on ' + channel + '.</p>');
  return findLead(l => l.id === id);
}

function setLeadField(lead, header, value) {
  const sh = sheet('Leads', LEAD_HEADERS);
  sh.getRange(lead.row, LEAD_HEADERS.indexOf(header) + 1).setValue(value);
}

function saveLeadState(lead, status) {
  const sh = sheet('Leads', LEAD_HEADERS);
  let hist = JSON.stringify(lead.history);
  while (hist.length > 48000 && lead.history.length > 2) { lead.history.splice(1, 2); hist = JSON.stringify(lead.history); }
  sh.getRange(lead.row, 7, 1, 4).setValues([[status, lead.chatId || '', lead.covered.join(','), hist]]);
  lead.status = status;
}

// One conversation step at a time, so quick double messages don't overwrite each other
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { fn(); } finally { lock.releaseLock(); }
}

// Webhooks can be delivered twice; remember what we already handled for 6 hours
function seenBefore(key) {
  const cache = CacheService.getScriptCache();
  if (cache.get(key)) return true;
  cache.put(key, '1', 21600);
  return false;
}

function digits(s) { return String(s || '').replace(/\D/g, ''); }
function samePhone(a, b) { const x = digits(a), y = digits(b); return x.length >= 7 && y.length >= 7 && (x.slice(-9) === y.slice(-9)); }

// ---------- Senders ----------

function tgSend(chatId, text, markup) {
  const token = prop('TELEGRAM_BOT_TOKEN');
  if (!token) return false;
  const body = { chat_id: chatId, text: String(text).slice(0, 4000) };
  if (markup) body.reply_markup = markup;
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify(body)
  });
  return res.getResponseCode() === 200;
}

function waConfigured() { return !!(prop('WHATSAPP_TOKEN') && prop('WHATSAPP_PHONE_NUMBER_ID')); }

function waPost(payload) {
  const res = UrlFetchApp.fetch('https://graph.facebook.com/' + GRAPH_VERSION + '/' + prop('WHATSAPP_PHONE_NUMBER_ID') + '/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + prop('WHATSAPP_TOKEN') },
    payload: JSON.stringify(Object.assign({ messaging_product: 'whatsapp' }, payload))
  });
  if (res.getResponseCode() !== 200) console.error('WhatsApp ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 400));
  return res.getResponseCode() === 200;
}

function waSendText(to, text) {
  if (!waConfigured()) return false;
  return waPost({ to: digits(to), type: 'text', text: { body: String(text).slice(0, 4000) } });
}

// Business started conversations must open with a template Meta has approved
function waSendTemplate(to, firstName) {
  const name = prop('WHATSAPP_TEMPLATE');
  if (!name) return false;
  return waPost({ to: digits(to), type: 'template', template: {
    name: name, language: { code: prop('WHATSAPP_TEMPLATE_LANG') || 'en' },
    components: [{ type: 'body', parameters: [{ type: 'text', text: firstName || 'there' }] }]
  } });
}

// ---------- Claude ----------

function callClaude(opts) {
  const key = prop('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, error: 'not_configured' };

  const body = {
    model: MODEL,
    max_tokens: opts.max_tokens,
    system: opts.system,
    messages: opts.messages,
    output_config: { effort: opts.effort, format: { type: 'json_schema', schema: opts.schema } },
    cache_control: { type: 'ephemeral' },
    fallbacks: 'default'
  };
  const params = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  let res, code;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = UrlFetchApp.fetch(API_URL, params);
    code = res.getResponseCode();
    if (code !== 429 && code < 500) break;
    Utilities.sleep(2000);
  }
  if (code !== 200) {
    console.error('Claude API ' + code + ': ' + res.getContentText().slice(0, 500));
    return { ok: false, error: code === 429 ? 'busy' : 'api_error' };
  }

  const msg = JSON.parse(res.getContentText());
  if (msg.stop_reason === 'refusal') return { ok: false, error: 'refusal' };
  if (msg.stop_reason === 'max_tokens') return { ok: false, error: 'too_long' };
  const textBlock = (msg.content || []).filter(b => b.type === 'text').pop();
  if (!textBlock) return { ok: false, error: 'empty' };
  try {
    return { ok: true, data: JSON.parse(textBlock.text) };
  } catch (err) {
    console.error('Bad JSON from model: ' + textBlock.text.slice(0, 300));
    return { ok: false, error: 'bad_output' };
  }
}

// ---------- Delivery: sheet, email, Telegram ----------

function saveInterview(name, email, s, transcript) {
  sheet('Interviews', ['Received', 'Name', 'Email', 'Summary', 'Role', 'AI plan', 'Fit check', 'Package', 'Tasks', 'Tools', 'Style',
    'Privacy', 'Prep checklist', 'Open questions', 'Transcript'])
    .appendRow([
      new Date(), name, email, s.one_line, s.role + ' / ' + s.industry, s.plan_status, s.fit_warning, s.recommended_package,
      s.tasks.map(t => t.task + ': ' + t.skill_idea).join('\n'),
      s.tools_to_connect.join(', '), s.writing_style, s.privacy_limits,
      s.prep_checklist.join('\n'), s.open_questions.join('\n'), transcript.slice(0, 45000)
    ]);
}

function notifyOwner(subject, text, html) {
  const to = prop('OWNER_EMAIL');
  if (to) MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html, name: 'AI For You' });

  const token = prop('TELEGRAM_BOT_TOKEN'), chat = prop('TELEGRAM_CHAT_ID');
  if (token && chat) {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chat, text: (subject + '\n\n' + text).slice(0, 4000) }),
      muteHttpExceptions: true
    });
  }
}

function briefingText(name, email, s) {
  const list = a => a.length ? a.map(x => '- ' + x).join('\n') : '- none';
  return [
    name + ' (' + email + ')',
    s.one_line,
    '',
    'Role: ' + s.role + ', ' + s.industry,
    'AI today: ' + s.current_ai + ' (' + s.plan_status + ')',
    'Fit check: ' + s.fit_warning,
    'Suggested package: ' + s.recommended_package + '. ' + s.package_reason,
    '',
    'Top tasks:',
    s.tasks.map((t, i) => (i + 1) + '. ' + t.task + '\n   ' + t.detail + '\n   Skill idea: ' + t.skill_idea).join('\n'),
    '',
    'Connect: ' + (s.tools_to_connect.join(', ') || 'not mentioned'),
    'Writing style: ' + s.writing_style,
    'Keep private: ' + s.privacy_limits,
    'Company rules: ' + s.company_rules,
    'Preferred times: ' + s.preferred_times,
    'Qualified prospect: ' + (s.qualified_prospect ? 'Yes. ' : 'No. ') + s.qualification_reason,
    '',
    'Session plan:', list(s.session_plan),
    '',
    'Prepare before the call:', list(s.prep_checklist),
    '',
    'Ask in the session:', list(s.open_questions)
  ].join('\n');
}

function briefingHtml(name, email, s, transcript) {
  const ul = a => '<ul>' + (a.length ? a : ['none']).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  const row = (k, v) => '<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">' + k + '</td><td style="padding:6px 0">' + esc(v) + '</td></tr>';
  return '<div style="font:15px/1.55 -apple-system,Segoe UI,sans-serif;color:#111;max-width:680px">' +
    '<h2 style="margin:0 0 4px">' + esc(name) + '</h2><p style="margin:0 0 16px;color:#555">' + esc(email) + '</p>' +
    '<p style="font-size:17px;margin:0 0 20px"><b>' + esc(s.one_line) + '</b></p>' +
    '<table style="border-collapse:collapse;margin-bottom:20px">' +
    row('Role', s.role + ', ' + s.industry) + row('AI today', s.current_ai + ' (' + s.plan_status + ')') + row('Fit check', s.fit_warning) +
    row('Package', s.recommended_package + '. ' + s.package_reason) +
    row('Connect', s.tools_to_connect.join(', ') || 'not mentioned') + row('Style', s.writing_style) +
    row('Keep private', s.privacy_limits) + row('Company rules', s.company_rules) + row('Preferred times', s.preferred_times) + row('Qualified prospect', (s.qualified_prospect ? 'Yes. ' : 'No. ') + s.qualification_reason) + '</table>' +
    '<h3>Top tasks</h3><ol>' + s.tasks.map(t => '<li><b>' + esc(t.task) + '</b><br>' + esc(t.detail) +
      '<br><span style="color:#2340FF">Skill idea: ' + esc(t.skill_idea) + '</span></li>').join('') + '</ol>' +
    '<h3>Session plan</h3>' + ul(s.session_plan) +
    '<h3>Prepare before the call</h3>' + ul(s.prep_checklist) +
    '<h3>Ask in the session</h3>' + ul(s.open_questions) +
    '<details><summary>Full interview</summary><pre style="white-space:pre-wrap;font:13px/1.5 monospace">' + esc(transcript) + '</pre></details>' +
    '</div>';
}

// ---------- Helpers ----------

function sanitizeHistory(raw, allowEmpty) {
  if (!Array.isArray(raw) || (!allowEmpty && raw.length < 1)) return { ok: false, error: 'invalid' };
  const messages = [];
  for (const m of raw) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return { ok: false, error: 'invalid' };
    if (m.content.length > MAX_CHARS) return { ok: false, error: 'too_long' };
    messages.push({ role: m.role, content: m.content });
  }
  if (messages.length && messages[0].role !== 'assistant') return { ok: false, error: 'invalid' };
  if (messages.filter(m => m.role === 'user').length > MAX_TURNS) return { ok: false, error: 'too_many_turns' };
  return { ok: true, messages: messages };
}

// Caps interviews per day so a stranger can't run up your API bill
function takeDailySlot() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const props = PropertiesService.getScriptProperties();
    const today = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
    const k = 'COUNT_' + today;
    const n = Number(props.getProperty(k) || 0);
    const limit = Number(props.getProperty('DAILY_LIMIT') || 30);
    if (n >= limit) return false;
    props.setProperty(k, String(n + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function sheet(name, headers) {
  let id = prop('SHEET_ID');
  let ss = id ? SpreadsheetApp.openById(id) : null;
  if (!ss) {
    ss = SpreadsheetApp.create('AI For You clients');
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  }
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// ---------- Run these once from the editor ----------

/** Creates the "AI For You clients" sheet and asks for permissions. */
function setup() {
  sheet('Interviews', ['Received', 'Name', 'Email', 'Summary', 'Role', 'AI plan', 'Fit check', 'Package', 'Tasks', 'Tools', 'Style',
    'Privacy', 'Prep checklist', 'Open questions', 'Transcript']);
  sheet('Bookings', ['Received', 'Name', 'Email', 'Phone', 'Package', 'AI plan', 'AI', 'Date', 'Time', 'Notes']);
  sheet('Leads', LEAD_HEADERS);
  sheet('Referrers', REFERRER_HEADERS);
  sheet('Referrals', REFERRAL_LOG_HEADERS);
  // Check the Referrers tab for new clients every hour
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'syncReferrers')) {
    ScriptApp.newTrigger('syncReferrers').timeBased().everyHours(1).create();
  }
  console.log('Sheet ready: https://docs.google.com/spreadsheets/d/' + prop('SHEET_ID'));
}

/** After sending any message to your bot in Telegram, run this to get your chat ID. */
function findTelegramChatId() {
  const token = prop('TELEGRAM_BOT_TOKEN');
  if (!token) return console.log('Add TELEGRAM_BOT_TOKEN to Script Properties first.');
  const res = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates').getContentText());
  const chats = (res.result || []).map(u => u.message && u.message.chat).filter(Boolean);
  if (!chats.length) return console.log('No messages yet. Send "hi" to your bot in Telegram, then run this again.');
  console.log('Your chat ID: ' + chats[chats.length - 1].id + '  (add it as TELEGRAM_CHAT_ID)');
}

/** After deploying: connects Charles to your Telegram bot. Run once, and again after a new deployment URL. */
function setupTelegramBot() {
  const token = prop('TELEGRAM_BOT_TOKEN');
  if (!token) return console.log('Add TELEGRAM_BOT_TOKEN to Script Properties first.');
  const props = PropertiesService.getScriptProperties();
  let secret = prop('TELEGRAM_WEBHOOK_SECRET');
  if (!secret) { secret = Utilities.getUuid().replace(/-/g, ''); props.setProperty('TELEGRAM_WEBHOOK_SECRET', secret); }
  const me = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getMe').getContentText());
  props.setProperty('TELEGRAM_BOT_USERNAME', me.result.username);
  const url = ScriptApp.getService().getUrl() + '?tg=' + secret;
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ url: url, allowed_updates: ['message'] }), muteHttpExceptions: true
  });
  console.log('Bot @' + me.result.username + ': ' + res.getContentText());
}

/** Prints what to paste into Meta's WhatsApp webhook settings. */
function setupWhatsApp() {
  const props = PropertiesService.getScriptProperties();
  ['WHATSAPP_WEBHOOK_SECRET', 'WHATSAPP_VERIFY_TOKEN'].forEach(k => { if (!prop(k)) props.setProperty(k, Utilities.getUuid().replace(/-/g, '')); });
  console.log('Callback URL: ' + ScriptApp.getService().getUrl() + '?wa=' + prop('WHATSAPP_WEBHOOK_SECRET'));
  console.log('Verify token: ' + prop('WHATSAPP_VERIFY_TOKEN'));
  console.log('Then subscribe the webhook to the "messages" field.');
}

/** Sends a test notification to email and Telegram. */
function testNotifications() {
  notifyOwner('AI For You test', 'If you can read this, notifications work.', '<p>If you can read this, notifications work.</p>');
  console.log('Sent. Check your email and Telegram.');
}
