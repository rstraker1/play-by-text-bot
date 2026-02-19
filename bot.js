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
    userProgress[chatId] = { currentPlay: null, currentLine: 0, lastMessageId: null };
  }
  return userProgress[chatId];
}

function formatLine(line) {
  if (line.type === 'stage') {
    return `📍 *Stage*\n_${line.text}_`;
  }
  return `${line.avatar || '🎭'} *${line.sender}*\n${line.text}`;
}

async function sendLine(chatId, playId, lineIndex) {
  const play = plays[playId];
  if (!play) return;
  const line = play.lines[lineIndex];
  if (!line) return;
  
  const progress = getUserProgress(chatId);
  const isLastLine = lineIndex >= play.lines.length - 1;
  const keyboard = [];
  
  if (!isLastLine) {
    keyboard.push([{ text: 'Next →', callback_data: `next_${playId}_${lineIndex + 1}` }]);
  } else {
    keyboard.push([{ text: '✓ Fin', callback_data: 'fin' }]);
  }
  if (line.annotation) {
    keyboard[0].unshift({ text: '?', callback_data: `annotate_${playId}_${lineIndex}` });
  }
  
  try {
    const sent = await bot.sendMessage(chatId, formatLine(line), {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
    progress.currentPlay = playId;
    progress.currentLine = lineIndex;
    progress.lastMessageId = sent.message_id;
  } catch (error) {
    console.error('Error sending message:', error.message);
  }
}

async function sendAnnotation(chatId, playId, lineIndex) {
  const play = plays[playId];
  if (!play) return;
  const line = play.lines[lineIndex];
  if (!line || !line.annotation) return;
  
  try {
    await bot.sendMessage(chatId, `📖 *Annotation*\n\n${line.annotation}`, { parse_mode: 'Markdown' });
  } catch (error) {
    await bot.sendMessage(chatId, `📖 Annotation\n\n${line.annotation}`);
  }
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text === '/start') {
    const progress = getUserProgress(chatId);
    progress.currentPlay = null;
    progress.currentLine = 0;
    
    const playList = Object.entries(plays).map(([id, play]) => {
      return [{ text: `${play.emoji || '📖'} ${play.title}`, callback_data: `start_${id}` }];
    });
    
    if (playList.length === 0) {
      await bot.sendMessage(chatId, '🎭 *Play by Text*\n\nNo plays available yet.', { parse_mode: 'Markdown' });
      return;
    }
    
    await bot.sendMessage(chatId, '🎭 *Play by Text*\n\nClassic plays, delivered line by line.\n\nChoose a play:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: playList }
    });
  } else if (text === '/help') {
    await bot.sendMessage(chatId,
      `🎭 *Play by Text — Help*\n\n• Press *Next →* to advance\n• Press *?* for annotations\n\n/start — Choose a play\n/plays — List plays`,
      { parse_mode: 'Markdown' }
    );
  } else if (text === '/plays') {
    const playList = Object.entries(plays).map(([id, play]) => {
      return [{ text: `${play.emoji || '📖'} ${play.title}`, callback_data: `start_${id}` }];
    });
    await bot.sendMessage(chatId, '📚 *Available Plays*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: playList }
    });
  }
}

async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  await bot.answerCallbackQuery(query.id);
  
  if (data.startsWith('start_')) {
    const playId = data.replace('start_', '');
    const play = plays[playId];
    if (play) {
      await bot.sendMessage(chatId, `🎭 *${play.title}*\n_${play.author}_\n\n${play.description || ''}\n\nStarting...`, { parse_mode: 'Markdown' });
      setTimeout(() => sendLine(chatId, playId, 0), 1000);
    }
  } else if (data.startsWith('next_')) {
    const parts = data.split('_');
    const playId = parts[1];
    const lineIndex = parseInt(parts[2], 10);
    
    try {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id });
    } catch (e) {}
    
    await sendLine(chatId, playId, lineIndex);
  } else if (data.startsWith('annotate_')) {
    const parts = data.split('_');
    await sendAnnotation(chatId, parts[1], parseInt(parts[2], 10));
  } else if (data === 'fin') {
    await bot.sendMessage(chatId, '🎭 *Fin*\n\nThank you for reading!\n\n/plays for another.', { parse_mode: 'Markdown' });
  }
}

app.post(`/webhook/${token}`, (req, res) => {
  if (req.body.message) handleMessage(req.body.message);
  if (req.body.callback_query) handleCallbackQuery(req.body.callback_query);
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