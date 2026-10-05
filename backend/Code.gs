/**
 * Joogo backend (Google Apps Script web app)
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
 */

const MODEL = 'claude-opus-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TURNS = 40;          // client messages per interview
const MAX_CHARS = 2000;        // per client message
const TOPICS = ['role', 'ai_today', 'tasks', 'tools', 'style', 'privacy'];

const INTERVIEW_PROMPT = `You are the intake interviewer for Joogo, a service where a consultant sets up Claude, ChatGPT or Gemini for busy professionals who are not technical. You are talking with a new client before their setup call.

Your goal: in about 10 minutes, learn what the consultant needs to prepare a great setup. Cover these topics:
- role: their job, industry and what a normal workday looks like
- ai_today: which AI tools and plans they already have, how often they use them, what frustrates them
- tasks: the 3 repetitive tasks that take most of their time, with enough concrete detail to build a custom skill or GPT for each
- tools: email, calendar, file storage, chat, CRM and devices they work with
- style: how they write, tone, languages, words or habits to avoid
- privacy: information AI must never touch, and any company rules about AI

How to talk:
- One question per message. Short, warm, plain words. Under 60 words.
- When an answer is vague, ask one follow up for a concrete example before moving on.
- Reply in the language the client writes in.
- Never ask for passwords, API keys, card numbers or similar. If the client starts sharing one, tell them kindly not to and continue.
- Do not give setup advice or recommend products. If asked, say the consultant will cover it in the session.
- If the client wants to stop early, wrap up politely.

When every topic is covered well enough, or the client wants to stop, thank them, tell them the consultant will review their answers before the session, and set done to true.

Output fields: message is what the client sees. covered lists every topic covered so far. done is true only on your final message.`;

const SUMMARY_PROMPT = `You prepare briefings for a consultant who sets up Claude, ChatGPT and Gemini for clients. Read the intake interview below and write the briefing the consultant will use to prepare the setup session. Be specific and practical. Use only what the client said; write "not mentioned" when something is missing. The client recap is shown to the client, so write it in their language, warmly, in 2 or 3 sentences. Everything else is for the consultant, in English.`;

// ---------- Web entry points ----------

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    switch (req.action) {
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

function doGet() {
  return json({ ok: true, service: 'joogo' });
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

  const messages = [
    { role: 'user', content: 'The client ' + (name || '') + ' has opened the interview. Greet them by first name and ask your first question.' }
  ].concat(history.messages);

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
  const name = clean(req.name, 80);
  const email = clean(req.email, 120);
  const history = sanitizeHistory(req.messages);
  if (!history.ok) return { ok: false, error: history.error };

  const transcript = history.messages
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
      recommended_package: { type: 'string', enum: ['Starter', 'Pro', 'Team', 'Unsure'] },
      package_reason: { type: 'string' },
      session_plan: { type: 'array', items: { type: 'string' } },
      prep_checklist: { type: 'array', items: { type: 'string' } },
      open_questions: { type: 'array', items: { type: 'string' } },
      client_recap: { type: 'string' }
    },
    required: ['one_line', 'language', 'role', 'industry', 'current_ai', 'tasks', 'tools_to_connect', 'writing_style',
      'privacy_limits', 'company_rules', 'recommended_package', 'package_reason', 'session_plan', 'prep_checklist',
      'open_questions', 'client_recap'],
    additionalProperties: false
  };

  const out = callClaude({
    system: SUMMARY_PROMPT,
    messages: [{ role: 'user', content: 'Client name: ' + name + '\nClient email: ' + email + '\n\nInterview:\n\n' + transcript }],
    max_tokens: 12000,
    effort: 'medium',
    schema: schema
  });
  if (!out.ok) return out;
  const s = out.data;

  saveInterview(name, email, s, transcript);
  notifyOwner(
    'New intake: ' + name + ' (' + s.recommended_package + ')',
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
    ai: clean([].concat(req.ai || []).join(', '), 120),
    date: clean(req.date, 20),
    time: clean(req.time, 20),
    notes: clean(req.notes, 1500)
  };
  if (!b.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return { ok: false, error: 'invalid' };

  sheet('Bookings', ['Received', 'Name', 'Email', 'Phone', 'Package', 'AI', 'Date', 'Time', 'Notes'])
    .appendRow([new Date(), b.name, b.email, b.phone, b.pkg, b.ai, b.date, b.time, b.notes]);

  const text = 'New booking request\n\n' + b.name + ' (' + b.email + (b.phone ? ', ' + b.phone : '') + ')\n' +
    'Package: ' + b.pkg + '\nAI: ' + (b.ai || 'not chosen') + '\nWhen: ' + (b.date || 'any day') + ', ' + b.time +
    (b.notes ? '\n\nNotes: ' + b.notes : '');
  notifyOwner('New booking: ' + b.name, text, '<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">' + esc(text) + '</pre>');
  return { ok: true };
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
  sheet('Interviews', ['Received', 'Name', 'Email', 'Summary', 'Role', 'Package', 'Tasks', 'Tools', 'Style',
    'Privacy', 'Prep checklist', 'Open questions', 'Transcript'])
    .appendRow([
      new Date(), name, email, s.one_line, s.role + ' / ' + s.industry, s.recommended_package,
      s.tasks.map(t => t.task + ': ' + t.skill_idea).join('\n'),
      s.tools_to_connect.join(', '), s.writing_style, s.privacy_limits,
      s.prep_checklist.join('\n'), s.open_questions.join('\n'), transcript.slice(0, 45000)
    ]);
}

function notifyOwner(subject, text, html) {
  const to = prop('OWNER_EMAIL');
  if (to) MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html, name: 'Joogo' });

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
    'AI today: ' + s.current_ai,
    'Suggested package: ' + s.recommended_package + '. ' + s.package_reason,
    '',
    'Top tasks:',
    s.tasks.map((t, i) => (i + 1) + '. ' + t.task + '\n   ' + t.detail + '\n   Skill idea: ' + t.skill_idea).join('\n'),
    '',
    'Connect: ' + (s.tools_to_connect.join(', ') || 'not mentioned'),
    'Writing style: ' + s.writing_style,
    'Keep private: ' + s.privacy_limits,
    'Company rules: ' + s.company_rules,
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
    row('Role', s.role + ', ' + s.industry) + row('AI today', s.current_ai) +
    row('Package', s.recommended_package + '. ' + s.package_reason) +
    row('Connect', s.tools_to_connect.join(', ') || 'not mentioned') + row('Style', s.writing_style) +
    row('Keep private', s.privacy_limits) + row('Company rules', s.company_rules) + '</table>' +
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
    ss = SpreadsheetApp.create('Joogo clients');
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

/** Creates the "Joogo clients" sheet and asks for permissions. */
function setup() {
  sheet('Interviews', ['Received', 'Name', 'Email', 'Summary', 'Role', 'Package', 'Tasks', 'Tools', 'Style',
    'Privacy', 'Prep checklist', 'Open questions', 'Transcript']);
  sheet('Bookings', ['Received', 'Name', 'Email', 'Phone', 'Package', 'AI', 'Date', 'Time', 'Notes']);
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

/** Sends a test notification to email and Telegram. */
function testNotifications() {
  notifyOwner('Joogo test', 'If you can read this, notifications work.', '<p>If you can read this, notifications work.</p>');
  console.log('Sent. Check your email and Telegram.');
}
