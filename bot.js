const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN environment variable not set!');
  process.exit(1);
}

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const bot = new TelegramBot(token);

const userProgress = {};
const plays = {};
const playsDir = path.join(__dirname, 'plays');

function loadPlays() {
  if (!fs.existsSync(playsDir)) {
    fs.mkdirSync(playsDir, { recursive: true });
  }
  const files = fs.readdirSync(playsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const playId = file.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(playsDir, file), 'utf8'));
    plays[playId] = data;
    console.log(`Loaded play: ${data.title}`);
  }
  console.log(`Total plays loaded: ${Object.keys(plays).length}`);
}

function getUserProgress(chatId) {
  if (!userProgress[chatId]) {
    userProgress[chatId] = {
      currentPlay: null,
      currentLine: 0,
      lastMessageId: null,
      lastAnnotationId: null,
      deliveryMode: 'manual',
      pendingTimer: null,
      typingTimer: null,
      messageMap: {}
    };
  }
  return userProgress[chatId];
}

function formatLine(line) {
  if (line.type === 'stage') {
    return `${line.avatar || '📍'} *Stage*\n_${line.text}_`;
  }
  return `${line.avatar || '🎭'} *${line.sender}*\n${line.text}`;
}

const MODE_EMOJI = { manual: '👆', ambient: '🕯️', active: '⚡' };
const MODE_NEXT  = { manual: 'ambient', ambient: 'active', active: 'manual' };

function clearTimers(progress) {
  if (progress.pendingTimer) {
    clearTimeout(progress.pendingTimer);
    progress.pendingTimer = null;
  }
  if (progress.typingTimer) {
    clearTimeout(progress.typingTimer);
    progress.typingTimer = null;
  }
}

function wordCount(line) {
  return line?.text?.split(/\s+/).length || 10;
}

function scheduleNextLine(chatId, playId, lineIndex) {
  const progress = getUserProgress(chatId);

  clearTimers(progress);

  if (progress.deliveryMode === 'manual') return;

  const play = plays[playId];
  if (!play || lineIndex >= play.lines.length) return;

  let delay;
  if (progress.deliveryMode === 'ambient') {
    delay = (10 + Math.random() * 50) * 60 * 1000;
  } else if (progress.deliveryMode === 'active') {
    const prevWords = wordCount(play.lines[lineIndex - 1]);
    const readingTime = (prevWords / 200) * 60 * 1000;
    const beat = 2000 + Math.random() * 1500;   // 2–3.5s dramatic pause
    delay = Math.min(Math.max(readingTime + beat, 3000), 45000);
  }

  // Typing lead scales with the upcoming line's length
  const nextWords = wordCount(play.lines[lineIndex]);
  const typingLead = Math.min(
    Math.max(nextWords * 120, 600),   // 600ms floor, ~120ms per word
    4000,                              // 4s ceiling
    delay - 300                        // never fire after delivery
  );

  const typingDelay = Math.max(delay - typingLead, 0);
  progress.typingTimer = setTimeout(async () => {
    progress.typingTimer = null;
    try {
      await bot.sendChatAction(chatId, 'typing');
    } catch (e) {}
  }, typingDelay);

  progress.pendingTimer = setTimeout(async () => {
    progress.pendingTimer = null;
    await sendLine(chatId, playId, lineIndex);
  }, delay);
}

async function cleanupPrevious(chatId) {
  const progress = getUserProgress(chatId);

  if (progress.lastMessageId) {
    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: progress.lastMessageId }
      );
    } catch (e) {}
    progress.lastMessageId = null;
  }

  if (progress.lastAnnotationId && progress.deliveryMode === 'manual') {
    try {
      await bot.deleteMessage(chatId, progress.lastAnnotationId);
    } catch (e) {}
    progress.lastAnnotationId = null;
  }
}

async function sendLine(chatId, playId, lineIndex) {
  const play = plays[playId];
  if (!play) return;
  const line = play.lines[lineIndex];
  if (!line) return;

  const progress = getUserProgress(chatId);

  await cleanupPrevious(chatId);

  const isLastLine = lineIndex >= play.lines.length - 1;
  const keyboard = [];

  if (!isLastLine) {
    keyboard.push([{ text: 'Next ▶️', callback_data: `next:${playId}:${lineIndex + 1}` }]);
  } else {
    keyboard.push([{ text: '✅  Fin', callback_data: 'fin' }]);
  }
  if (line.annotation) {
    keyboard[0].unshift({ text: '?', callback_data: `annotate:${playId}:${lineIndex}` });
  }

  if (!isLastLine) {
    keyboard[0].push({
      text: MODE_EMOJI[progress.deliveryMode],
      callback_data: `mode:${playId}:${lineIndex + 1}`
    });
  }

  try {
    const sent = await bot.sendMessage(chatId, formatLine(line), {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
    progress.currentPlay = playId;
    progress.currentLine = lineIndex;
    progress.lastMessageId = sent.message_id;

    progress.messageMap[sent.message_id] = { playId, lineIndex };
  } catch (error) {
    console.error('Error sending message:', error.message);
  }

  if (!isLastLine) {
    scheduleNextLine(chatId, playId, lineIndex + 1);
  }
}

async function sendAnnotation(chatId, playId, lineIndex) {
  const play = plays[playId];
  if (!play) return;
  const line = play.lines[lineIndex];
  if (!line || !line.annotation) return;

  const progress = getUserProgress(chatId);

  try {
    const sent = await bot.sendMessage(chatId, `📍 *Annotation*\n\n${line.annotation}`, { parse_mode: 'Markdown' });
    progress.lastAnnotationId = sent.message_id;
  } catch (error) {
    const sent = await bot.sendMessage(chatId, `📍 Annotation\n\n${line.annotation}`);
    progress.lastAnnotationId = sent.message_id;
  }
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (text === '?' && msg.reply_to_message) {
    const progress = getUserProgress(chatId);
    const repliedId = msg.reply_to_message.message_id;
    const entry = progress.messageMap[repliedId];

    if (entry) {
      const play = plays[entry.playId];
      const line = play?.lines[entry.lineIndex];
      if (line?.annotation) {
        await sendAnnotation(chatId, entry.playId, entry.lineIndex);
      } else {
        await bot.sendMessage(chatId, '_No annotation for this line._', { parse_mode: 'Markdown' });
      }
    }
    return;
  }

  if (text === '/start') {
    const progress = getUserProgress(chatId);

    clearTimers(progress);

    progress.currentPlay = null;
    progress.currentLine = 0;
    progress.lastAnnotationId = null;
    progress.messageMap = {};

    const playList = Object.entries(plays).map(([id, play]) => {
      return [{ text: `${play.emoji || '🎭'} ${play.title}`, callback_data: `start:${id}` }];
    });

    if (playList.length === 0) {
      await bot.sendMessage(chatId, '🎭 *Play by Text*\n\nNo plays available yet.', { parse_mode: 'Markdown' });
      return;
    }

    await bot.sendMessage(chatId,
      '🎭 *Play by Text*\n\nClassic plays, delivered line by line.\n\nChoose a play to begin:\n\n_Note: After 15min of inactivity, the first button press wakes the bot (takes 30–60 sec). Just wait, then press again!_\n\n_Tip: Type /start anytime to return to this menu_', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: playList }
    });
  } else if (text === '/help') {
    await bot.sendMessage(chatId,
      `🎭 *Play by Text — Help*\n\n• Press *Next ▶️* to advance\n• Press *?* on any line for its annotation\n• Reply to any line with *?* to get its annotation later\n• Press the mode button to cycle delivery:\n    👆 Manual — tap Next yourself\n    🕯️ Ambient — next line arrives in 10–60 min\n    ⚡ Active — next line arrives in ~20 sec\n\n/start — Choose a play\n/plays — List plays`,
      { parse_mode: 'Markdown' }
    );
  } else if (text === '/plays') {
    const playList = Object.entries(plays).map(([id, play]) => {
      return [{ text: `${play.emoji || '🎭'} ${play.title}`, callback_data: `start:${id}` }];
    });
    await bot.sendMessage(chatId, '🎭 *Available Plays*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: playList }
    });
  }
}

async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('start:')) {
    await bot.answerCallbackQuery(query.id);
    const playId = data.slice('start:'.length);
    const play = plays[playId];
    if (play) {
      await bot.sendMessage(
        chatId,
        `${play.emoji || '🎭'} *${play.title}*\n_${play.author}_`,
        { parse_mode: 'Markdown' }
      );
      if (play.image) {
        await bot.sendPhoto(chatId, play.image);
      }
      if (play.description) {
        await bot.sendMessage(chatId, play.description, {
          reply_markup: { inline_keyboard: [[{ text: 'Next ▶️', callback_data: `next:${playId}:0` }]] }
        });
      } else {
        setTimeout(() => sendLine(chatId, playId, 0), 500);
      }
    }

  } else if (data.startsWith('next:')) {
    await bot.answerCallbackQuery(query.id);
    const parts = data.split(':');
    const playId = parts[1];
    const lineIndex = parseInt(parts[2], 10);

    const progress = getUserProgress(chatId);
    clearTimers(progress);

    await sendLine(chatId, playId, lineIndex);

  } else if (data.startsWith('annotate:')) {
    await bot.answerCallbackQuery(query.id);
    const parts = data.split(':');
    await sendAnnotation(chatId, parts[1], parseInt(parts[2], 10));

  } else if (data.startsWith('mode:')) {
    const parts = data.split(':');
    const playId = parts[1];
    const nextLineIndex = parseInt(parts[2], 10);

    const progress = getUserProgress(chatId);
    const newMode = MODE_NEXT[progress.deliveryMode];
    progress.deliveryMode = newMode;

    clearTimers(progress);
    scheduleNextLine(chatId, playId, nextLineIndex);

    const play = plays[playId];
    if (play && progress.lastMessageId) {
      const currentLineIndex = nextLineIndex - 1;
      const line = play.lines[currentLineIndex];
      const isLastLine = currentLineIndex >= play.lines.length - 1;

      if (!isLastLine) {
        const keyboard = [];
        keyboard.push([{ text: 'Next ▶️', callback_data: `next:${playId}:${nextLineIndex}` }]);
        if (line && line.annotation) {
          keyboard[0].unshift({ text: '?', callback_data: `annotate:${playId}:${currentLineIndex}` });
        }
        keyboard[0].push({
          text: MODE_EMOJI[newMode],
          callback_data: `mode:${playId}:${nextLineIndex}`
        });

        try {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: keyboard },
            { chat_id: chatId, message_id: progress.lastMessageId }
          );
        } catch (e) {}
      }
    }

    await bot.answerCallbackQuery(query.id, {
      text: `${MODE_EMOJI[newMode]} ${newMode.charAt(0).toUpperCase() + newMode.slice(1)} mode`
    });

  } else if (data === 'fin') {
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, '🎭 *Fin*\n\nThank you for reading!\n\n/plays for another.', { parse_mode: 'Markdown' });
  }
}

app.post(`/webhook/${token}`, (req, res) => {
  try {
    if (req.body.message) handleMessage(req.body.message);
    if (req.body.callback_query) handleCallbackQuery(req.body.callback_query);
  } catch (error) {
    console.error('Webhook handler error:', error);
  }
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('Play by Text bot is running! 🎭'));

const PORT = process.env.PORT || 10000;

async function startServer() {
  loadPlays();
  app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    if (url) {
      const webhookUrl = `${url}/webhook/${token}`;
      await bot.setWebHook(webhookUrl);
      console.log(`Webhook set to: ${webhookUrl}`);
    }
  });
}

startServer();