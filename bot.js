const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Bot token from environment variable
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN environment variable not set!');
  process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(token, { polling: true });

// In-memory storage for user progress (in production, use a database)
const userProgress = {};

// Load plays from JSON files
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

// Get or create user progress
function getUserProgress(chatId) {
  if (!userProgress[chatId]) {
    userProgress[chatId] = {
      currentPlay: null,
      currentLine: 0,
      lastMessageId: null
    };
  }
  return userProgress[chatId];
}

// Format a line for sending
function formatLine(line) {
  if (line.type === 'stage') {
    // Stage directions in italic
    return `📍 *Stage*\n_${line.text}_`;
  } else {
    // Character dialogue
    return `${line.avatar || '🎭'} *${line.sender}*\n${line.text}`;
  }
}

// Send a line with Next button
async function sendLine(chatId, playId, lineIndex) {
  const play = plays[playId];
  if (!play) return;
  
  const line = play.lines[lineIndex];
  if (!line) return;
  
  const progress = getUserProgress(chatId);
  const isLastLine = lineIndex >= play.lines.length - 1;
  
  // Build inline keyboard
  const keyboard = [];
  
  if (!isLastLine) {
    keyboard.push([{ text: 'Next →', callback_data: `next_${playId}_${lineIndex + 1}` }]);
  } else {
    keyboard.push([{ text: '✓ Fin', callback_data: 'fin' }]);
  }
  
  // Add "?" button for annotation if available
  if (line.annotation) {
    keyboard[0].unshift({ text: '?', callback_data: `annotate_${playId}_${lineIndex}` });
  }
  
  const message = formatLine(line);
  
  try {
    const sent = await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
    
    progress.currentPlay = playId;
    progress.currentLine = lineIndex;
    progress.lastMessageId = sent.message_id;
    
  } catch (error) {
    console.error('Error sending message:', error.message);
    // Try without markdown if it fails
    try {
      const plainMessage = line.type === 'stage' 
        ? `📍 Stage\n${line.text}`
        : `${line.avatar || '🎭'} ${line.sender}\n${line.text}`;
        
      await bot.sendMessage(chatId, plainMessage, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (e) {
      console.error('Error sending plain message:', e.message);
    }
  }
}

// Send annotation
async function sendAnnotation(chatId, playId, lineIndex) {
  const play = plays[playId];
  if (!play) return;
  
  const line = play.lines[lineIndex];
  if (!line || !line.annotation) return;
  
  const message = `📖 *Annotation*\n\n${line.annotation}`;
  
  try {
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });
  } catch (error) {
    // Try without markdown
    await bot.sendMessage(chatId, `📖 Annotation\n\n${line.annotation}`);
  }
}

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const progress = getUserProgress(chatId);
  
  // Reset progress
  progress.currentPlay = null;
  progress.currentLine = 0;
  
  const playList = Object.entries(plays).map(([id, play]) => {
    return [{ text: `${play.emoji || '📖'} ${play.title}`, callback_data: `start_${id}` }];
  });
  
  if (playList.length === 0) {
    await bot.sendMessage(chatId, 
      '🎭 *Play by Text*\n\nNo plays available yet. Check back soon!',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  await bot.sendMessage(chatId, 
    '🎭 *Play by Text*\n\nClassic plays, delivered line by line.\n\nChoose a play to begin:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: playList
      }
    }
  );
});

// Handle /help command
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId,
    `🎭 *Play by Text — Help*\n\n` +
    `*How it works:*\n` +
    `• Choose a play to start reading\n` +
    `• Press *Next →* to advance to the next line\n` +
    `• Press *?* to get an annotation explaining the line\n` +
    `• Reply with "?" to any message to ask about it\n\n` +
    `*Commands:*\n` +
    `/start — Choose a play\n` +
    `/help — Show this help\n` +
    `/plays — List available plays`,
    { parse_mode: 'Markdown' }
  );
});

// Handle /plays command
bot.onText(/\/plays/, async (msg) => {
  const chatId = msg.chat.id;
  
  const playList = Object.entries(plays).map(([id, play]) => {
    return [{ text: `${play.emoji || '📖'} ${play.title}`, callback_data: `start_${id}` }];
  });
  
  if (playList.length === 0) {
    await bot.sendMessage(chatId, 'No plays available yet.');
    return;
  }
  
  await bot.sendMessage(chatId, 
    '📚 *Available Plays*\n\nChoose one to begin:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: playList
      }
    }
  );
});

// Handle callback queries (button presses)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  // Acknowledge the button press
  await bot.answerCallbackQuery(query.id);
  
  if (data.startsWith('start_')) {
    // Start a play
    const playId = data.replace('start_', '');
    const play = plays[playId];
    
    if (play) {
      await bot.sendMessage(chatId,
        `🎭 *${play.title}*\n_${play.author}_\n\n${play.description || ''}\n\nStarting...`,
        { parse_mode: 'Markdown' }
      );
      
      // Small delay for dramatic effect
      setTimeout(() => sendLine(chatId, playId, 0), 1000);
    }
    
  } else if (data.startsWith('next_')) {
      // Next line
      const parts = data.split('_');
      const playId = parts[1];
      const lineIndex = parseInt(parts[2], 10);
      
      // Remove buttons from the previous message
      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: query.message.message_id }
        );
      } catch (e) {
        // Ignore if edit fails
      }
      
      await sendLine(chatId, playId, lineIndex);
    
  } else if (data.startsWith('annotate_')) {
    // Show annotation
    const parts = data.split('_');
    const playId = parts[1];
    const lineIndex = parseInt(parts[2], 10);
    
    await sendAnnotation(chatId, playId, lineIndex);
    
  } else if (data === 'fin') {
    // End of play
    await bot.sendMessage(chatId,
      '🎭 *Fin*\n\nThank you for reading!\n\nUse /plays to choose another play.',
      { parse_mode: 'Markdown' }
    );
  }
});

// Handle "?" replies
bot.on('message', async (msg) => {
  if (msg.text === '?' && msg.reply_to_message) {
    const chatId = msg.chat.id;
    const progress = getUserProgress(chatId);
    
    // Try to find what line they're asking about
    // This is tricky because we need to match the message text to a line
    const replyText = msg.reply_to_message.text;
    const play = plays[progress.currentPlay];
    
    if (play) {
      // Search for matching line
      for (let i = 0; i < play.lines.length; i++) {
        const line = play.lines[i];
        if (replyText && replyText.includes(line.text)) {
          if (line.annotation) {
            await sendAnnotation(chatId, progress.currentPlay, i);
            return;
          }
        }
      }
    }
    
    // If no annotation found
    await bot.sendMessage(chatId, "No annotation available for this line.");
  }
});

// Start the bot
console.log('Loading plays...');
loadPlays();
console.log('Bot is running...');
