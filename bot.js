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

function formatLine(play, line) {
  const avatar = play.characters?.[line.sender] || '\u{1F3AD}';
  if (line.type === 'stage') {
    return `${avatar} *Stage*\n_${line.text}_`;
  }
  return `${avatar} *${line.sender}*\n${line.text}`;
}

const MODE_EMOJI = { manual: '\u23F8', ambient: '\u{1F56F}\uFE0F', active: '\u26A1' };
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
    const beat = 2000 + Math.random() * 1500;
    delay = Math.min(Math.max(readingTime + beat, 3000), 45000);
  }

  const nextWords = wordCount(play.lines[lineIndex]);
  const typingLead = Math.min(
    Math.max(nextWords * 120, 600),
    4000,
    delay - 300
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
    await sendLine(chatId, playId, lineIndex, false);
  }, delay);
}

async function cleanupPrevious(chatId, manualAdvance = false) {
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

  if (progress.lastAnnotationId && (progress.deliveryMode === 'manual' || manualAdvance)) {
    try {
      await bot.deleteMessage(chatId, progress.lastAnnotationId);
    } catch (e) {}
    progress.lastAnnotationId = null;
  }
}

async function sendLine(chatId, playId, lineIndex, manualAdvance = false) {
  const play = plays[playId];
  if (!play) return;
  const line = play.lines[lineIndex];
  if (!line) return;

  const progress = getUserProgress(chatId);

  await cleanupPrevious(chatId, manualAdvance);

  const isLastLine = lineIndex >= play.lines.length - 1;
  const keyboard = [];

  if (!isLastLine) {
    keyboard.push([{ text: '▽', callback_data: `next:${playId}:${lineIndex + 1}` }]);
  } else {
    keyboard.push([{ text: '\u2705  Fin', callback_data: 'fin' }]);
  }
  if (line.annotation) {
    keyboard[0].unshift({ text: '🔍', callback_data: `annotate:${playId}:${lineIndex}` });
  }

  if (!isLastLine) {
    keyboard[0].push({
      text: MODE_EMOJI[progress.deliveryMode],
      callback_data: `mode:${playId}:${lineIndex + 1}`
    });
  }

  try {
    const sent = await bot.sendMessage(chatId, formatLine(play, line), {
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

  let annotationText;
  if (lineIndex === 'intro') {
    annotationText = play.introAnnotation;
  } else {
    const line = play.lines[lineIndex];
    if (!line || !line.annotation) return;
    annotationText = line.annotation;
  }

  if (!annotationText) return;

  const progress = getUserProgress(chatId);

  try {
    const sent = await bot.sendMessage(chatId, `\u{1F50D} *Annotation*\n\n${annotationText}`, { parse_mode: 'Markdown' });
    progress.lastAnnotationId = sent.message_id;
  } catch (error) {
    const sent = await bot.sendMessage(chatId, `\u{1F50D} Annotation\n\n${annotationText}`);
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
      return [{ text: `${play.emoji || '\u{1F3AD}'} ${play.title}`, callback_data: `start:${id}` }];
    });

    if (playList.length === 0) {
      await bot.sendMessage(chatId, '\u{1F3AD} *Play by Text*\n\nNo plays available yet.', { parse_mode: 'Markdown' });
      return;
    }

    await bot.sendMessage(chatId,
'     \u{1F3AD} Choose a play to begin:\n\n_Type /start anytime to return here, & /help for more info._', {      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: playList }
    });
  } else if (text === '/help') {
    await bot.sendMessage(chatId,
      `\u{1F3AD} *Play by Text \u2014 Help*\n\n\u2022 Press *\u25BD* to advance\n\u2022 Press *\u{1F50D}* on any line for its annotation\n\u2022 Reply to any line with *?* to get its annotation later\n\u2022 Press the mode button to cycle delivery:\n    \u23F8 Manual \u2014 tap \u25BD yourself\n    \u{1F56F}\uFE0F Ambient \u2014 next line arrives in 10\u201360 min\n    \u26A1 Active \u2014 next line arrives in ~20 sec\n\n/start \u2014 Choose a play\n/plays \u2014 List plays`,
      { parse_mode: 'Markdown' }
    );
  } else if (text === '/plays') {
    const playList = Object.entries(plays).map(([id, play]) => {
      return [{ text: `${play.emoji || '\u{1F3AD}'} ${play.title}`, callback_data: `start:${id}` }];
    });
    await bot.sendMessage(chatId, '\u{1F3AD} *Available Plays*', {
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
      const progress = getUserProgress(chatId);
      clearTimers(progress);

      await bot.sendMessage(
        chatId,
        `${play.emoji || '\u{1F3AD}'} *${play.title}*\n_${play.author}_`,
        { parse_mode: 'Markdown' }
      );
      if (play.image) {
        await bot.sendPhoto(chatId, play.image);
      }
      if (play.description) {
        const keyboard = [[{ text: '▽', callback_data: `next:${playId}:0` }]];
        if (play.introAnnotation) {
          keyboard[0].unshift({ text: '🔍', callback_data: `annotate:${playId}:intro` });
        }
        keyboard[0].push({
          text: MODE_EMOJI[progress.deliveryMode],
          callback_data: `mode:${playId}:0`
        });

        const sent = await bot.sendMessage(chatId, play.description, {
          reply_markup: { inline_keyboard: keyboard }
        });
        progress.lastMessageId = sent.message_id;
        progress.currentPlay = playId;
      } else {
        setTimeout(() => sendLine(chatId, playId, 0, true), 500);
      }
    }

  } else if (data.startsWith('next:')) {
    await bot.answerCallbackQuery(query.id);
    const parts = data.split(':');
    const playId = parts[1];
    const lineIndex = parseInt(parts[2], 10);

    const progress = getUserProgress(chatId);
    clearTimers(progress);

    await sendLine(chatId, playId, lineIndex, true);

  } else if (data.startsWith('annotate:')) {
    await bot.answerCallbackQuery(query.id);
    const parts = data.split(':');
    const lineIndex = parts[2] === 'intro' ? 'intro' : parseInt(parts[2], 10);
    await sendAnnotation(chatId, parts[1], lineIndex);

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
      const isDescription = currentLineIndex < 0;
      const line = isDescription ? null : play.lines[currentLineIndex];
      const isLastLine = !isDescription && currentLineIndex >= play.lines.length - 1;

      if (isDescription || !isLastLine) {
        const keyboard = [];
        keyboard.push([{ text: '▽', callback_data: `next:${playId}:${nextLineIndex}` }]);

        if (isDescription && play.introAnnotation) {
          keyboard[0].unshift({ text: '🔍', callback_data: `annotate:${playId}:intro` });
        } else if (line && line.annotation) {
          keyboard[0].unshift({ text: '🔍', callback_data: `annotate:${playId}:${currentLineIndex}` });
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
    await bot.sendMessage(chatId, '\u{1F3AD} *Fin*\n\nThank you for reading!\n\n/plays for another.', { parse_mode: 'Markdown' });
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

app.get('/', (req, res) => res.send('Play by Text bot is running! \u{1F3AD}'));

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
