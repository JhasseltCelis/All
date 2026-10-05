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
- The service needs a paid AI plan. If they're on a free plan, mention kindly that they'll need to upgrade before the session, and that the consultant will help them pick. If they turn out to be a developer or very technical, be honest that they may not need the service, and let the consultant decide.

When every topic is covered well enough, or the client wants to stop, thank them, tell them the consultant will review their answers before the session, and set done to true.

Output fields: message is what the client sees. covered lists every topic covered so far. done is true only on your final message.`;

const SUMMARY_PROMPT = `You prepare briefings for a consultant who sets up Claude, ChatGPT and Gemini for clients. Read the intake interview below and write the briefing the consultant will use to prepare the setup session. Be specific and practical. Use only what the client said; write "not mentioned" when something is missing. The service needs a paid AI plan and is not meant for developers or very technical people: set fit_warning to a short note if the client is on a free plan or seems too technical to need help, otherwise "none". The client recap is shown to the client, so write it in their language, warmly, in 2 or 3 sentences. Everything else is for the consultant, in English.`;

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
  return finishInterview(clean(req.name, 80), clean(req.email, 120), history.messages, 'website');
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
      client_recap: { type: 'string' }
    },
    required: ['one_line', 'language', 'role', 'industry', 'current_ai', 'plan_status', 'fit_warning', 'tasks', 'tools_to_connect', 'writing_style',
      'privacy_limits', 'company_rules', 'preferred_times', 'recommended_package', 'package_reason', 'session_plan', 'prep_checklist',
      'open_questions', 'client_recap'],
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
  return { ok: true, recap: s.client_recap };
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

const LEAD_HEADERS = ['Received', 'Id', 'Name', 'Phone', 'Package', 'Channel', 'Status', 'Chat id', 'Covered', 'History'];

function handleLead(req) {
  const lead = {
    name: clean(req.name, 80),
    phone: clean(req.phone, 40),
    pkg: clean(req.package, 40),
    channel: req.channel === 'telegram' ? 'telegram' : 'whatsapp'
  };
  if (!lead.name || digits(lead.phone).length < 7) return { ok: false, error: 'invalid' };
  lead.id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  sheet('Leads', LEAD_HEADERS).appendRow([new Date(), lead.id, lead.name, lead.phone, lead.pkg, lead.channel, 'new', '', '', '[]']);

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
  const text = 'New lead: ' + lead.name + ', ' + lead.phone + '\nPackage: ' + (lead.pkg || 'not sure') + '\nWants to talk on ' + how;
  notifyOwner('New lead: ' + lead.name, text, '<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">' + esc(text) + '</pre>');
  return out;
}

// ---------- Charles in messaging apps ----------

function handleTelegramUpdate(secret, update) {
  if (secret !== prop('TELEGRAM_WEBHOOK_SECRET')) return json({ ok: false });
  if (seenBefore('tg' + update.update_id)) return json({ ok: true });
  const m = update.message;
  if (!m || !m.chat || String(m.chat.id) === String(prop('TELEGRAM_CHAT_ID'))) return json({ ok: true });
  const chatId = String(m.chat.id);
  const send = text => tgSend(chatId, text);
  if (typeof m.text !== 'string') { send('I can only read text messages for now.'); return json({ ok: true }); }

  let lead, text = m.text.trim();
  const start = text.match(/^\/start(?:\s+(\w+))?/);
  if (start) {
    lead = start[1] ? findLead(l => l.id === start[1]) : null;
    if (!lead) lead = findLead(l => l.chatId === chatId && l.status !== 'done');
    if (!lead) lead = newLead((m.from && m.from.first_name) || 'there', '', 'telegram');
    setLeadField(lead, 'Chat id', chatId);
    lead.chatId = chatId;
    text = null; // /start is not an answer
  } else {
    lead = findLead(l => l.chatId === chatId && l.status !== 'done') || findLead(l => l.chatId === chatId);
    if (!lead) { lead = newLead((m.from && m.from.first_name) || 'there', '', 'telegram'); setLeadField(lead, 'Chat id', chatId); lead.chatId = chatId; }
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
      status: String(r[6]), chatId: String(r[7]), covered: String(r[8] || '').split(',').filter(Boolean), history: history };
    if (match(lead)) return lead;
  }
  return null;
}

function newLead(name, phone, channel) {
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  sheet('Leads', LEAD_HEADERS).appendRow([new Date(), id, name, phone, '', channel, 'new', '', '', '[]']);
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

function tgSend(chatId, text) {
  const token = prop('TELEGRAM_BOT_TOKEN');
  if (!token) return false;
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000) })
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
    row('Keep private', s.privacy_limits) + row('Company rules', s.company_rules) + row('Preferred times', s.preferred_times) + '</table>' +
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
