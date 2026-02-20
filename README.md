# Play by Text 🎭

Classic plays delivered line by line via Telegram.

## How it works

Users chat with your bot. They choose a play, then receive it one line at a time, pressing "Next →" to advance. They can press "?" to get annotations explaining archaic language or context.

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Follow the prompts to name your bot
4. Copy the **token** BotFather gives you (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Deploy to Render

1. Push this code to a GitHub repository
2. Go to [render.com](https://render.com) and sign in
3. Click **New +** → **Web Service**
4. Connect your GitHub repo
5. Configure:
   - **Name**: `play-by-text-bot` (or whatever you like)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Add **Environment Variables**:
   - Key: `TELEGRAM_BOT_TOKEN`
   - Value: (paste your bot token from BotFather)
   - Key: `RENDER_EXTERNAL_URL`
   - Value: (your service URL, e.g. `https://play-by-text-bot.onrender.com`)
   - Key: `TELEGRAM_BOT_TOKEN`
   - Value: (paste your bot token from BotFather)
7. Click **Create Web Service**

### 3. Test Your Bot

1. Open Telegram
2. Search for your bot by the username you gave it
3. Press **Start** or send `/start`
4. Choose a play and enjoy!

## Adding New Plays

Create a JSON file in the `/plays` folder. Format:

```json
{
  "id": "play-id",
  "title": "Play Title",
  "author": "Author Name",
  "emoji": "🎭",
  "description": "Brief description shown before play starts.",
  "lines": [
    {
      "type": "stage",
      "sender": "Stage",
      "avatar": "📍",
      "text": "Stage direction in italics.",
      "annotation": "Explanation of this stage direction."
    },
    {
      "type": "character",
      "sender": "Character Name",
      "avatar": "🎭",
      "text": "The character's line.",
      "annotation": "Explanation of this line (optional)."
    }
  ]
}
```

### Tips for preparing plays:

- **type**: Either `"stage"` for stage directions or `"character"` for dialogue
- **avatar**: Pick an emoji that fits the character
- **annotation**: Explain archaic words, context, or significance. Optional but valuable.
- Keep lines reasonably short — this is messaging, not a book
- You can split long speeches into multiple messages

## Commands

- `/start` — Choose a play
- `/plays` — List available plays  
- `/help` — Show help

## License

Bot code: MIT. Do what you want.

Play texts: Public domain (Shakespeare, Beckett post-copyright, etc.). Check copyright status before adding modern plays.

## Ideas for expansion

- [ ] Timed delivery mode (one line per hour/day)
- [ ] Multiple languages
- [ ] Audio for each line? (speaker button next to '?')
- [ ] User progress persistence (database)
- [ ] More plays!
- [ ] different colored names?
- [ ] Can annotation disappear upon pressing 'next' button? Or user can just delete it if they wish, as it is.
- [ ]Pictures now and then
- [ ]Put space either at the end of each msg, or between msgs (if possible), to create some separation. Kinda cluttered currently.
- [ ] what other neat features does telegram have which may be utilized?

