# WhatsApp Job Bot 🤖

An advanced WhatsApp bot built with Baileys that automatically handles stock count messages, provides interactive menus, games, utilities, and more!

## 🌟 Features

### 📊 Stock Count Automation
- **Auto-reacts** to messages containing "new stock count" with 👍 emoji
- **Tracks reactions** and sends notifications when 10 reactions are reached
- **Automatic marking** for job-related messages

### 🎮 Interactive Menu System
- **Main Menu** with 9 categories
- **Session management** with 5-minute timeout
- **Breadcrumb navigation** (back/forward)
- **User-friendly interface**

### 🎨 Creative Hub
- **ASCII Art Generator** - Convert text to ASCII art
- **AI Chat Mode** - Intelligent conversation
- **Image to ASCII** (Coming Soon)

### 🎮 Games Arena
- **Rock Paper Scissors** - Classic game with scoring
- **Number Guessing** - Guess numbers 1-100 with attempts
- **Trivia Quiz** - Multiple choice questions
- **Leaderboards** - Track high scores

### 🛠️ Utility Center
- **Calculator** - Math calculations
- **Translator** - Multi-language translation
- **Notes System** - Personal note taking
- **Reminders** - Set time-based reminders

### 👥 Group Management
- **Announcements** - Broadcast to group members
- **Tag All** - Mention all group members
- **Group Lock/Unlock** - Control group restrictions
- **Kick Users** - Remove members (admin only)

### 📺 YouTube Integration
- **Video Search** - Find YouTube videos
- **Video Info** - Get video details and stats
- **Audio Info** - Extract audio information

### 🎭 Fun Zone
- **Random Jokes** - Get jokes from API
- **Fun Facts** - Learn interesting facts
- **Inspirational Quotes** - Daily motivation

### 👑 Admin Panel
- **User Management** - View active users and admins
- **Feature Toggle** - Enable/disable bot features
- **Master Switch** - Emergency bot shutdown
- **Game Management** - Control game settings

### 🔧 Owner Tools
- **Broadcast Messages** - Send to all users
- **Bot Restart** - Restart bot remotely
- **Add Admins** - Promote users to admin
- **Clear Data** - Reset bot database

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- WhatsApp account
- Railway account (for deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MichealDDev/whatsapp-job-bot.git
   cd whatsapp-job-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the bot**
   ```bash
   npm start
   ```

4. **Scan QR Code**
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices
   - Scan the QR code displayed in terminal

## 📦 Dependencies

```json
{
  "@whiskeysockets/baileys": "^6.7.8",
  "qrcode-terminal": "^0.12.0",
  "pino": "^8.19.0",
  "ytdl-core": "^4.11.5",
  "node-fetch": "^2.7.0"
}
```

## 🌐 Railway Deployment

This bot is configured for automatic deployment on Railway with the following settings:

### Railway Configuration (`railway.json`)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node index.js",
    "sleepApplication": true,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Key Features:
- **Auto-Build**: Uses NIXPACKS builder (automatic dependency detection)
- **Start Command**: `node index.js` (runs your main bot file)
- **Sleep Mode**: Enabled (saves resources when inactive)
- **Auto-Restart**: Restarts on failure (up to 10 retries)
- **Auto-Deploy**: Every push to `main` branch triggers deployment

### Deployment Steps:
1. **Connect Repository** - Link GitHub repo to Railway
2. **Auto-Detection** - Railway detects Node.js project automatically
3. **Build Process** - Installs dependencies with `npm install`
4. **Deploy** - Starts bot with `node index.js`
5. **Monitor** - Railway handles restarts and logging

### Railway Features:
- **Automatic Restarts** - Bot restarts if it crashes (max 10 attempts)
- **Sleep Application** - Saves resources when bot is idle
- **Real-time Logs** - Monitor bot activity in Railway dashboard
- **Environment Variables** - Set secrets in Railway dashboard

## 📱 How to Use

### Basic Commands
- `.menu` - Show main menu
- `.back` - Go back to previous menu
- `.admin` - Access admin panel (admin only)
- `.help` - Show help information

### Quick Commands
- `.ping` - Check bot status and latency
- `.joke` - Get a random joke
- `.fact` - Get a fun fact
- `.quote` - Get inspirational quote
- `.calc 2+2` - Calculate math expressions
- `.translate es Hello` - Translate text

### YouTube Commands
- `.ytsearch cat videos` - Search YouTube
- `.ytvideo [URL]` - Get video information
- `.ytaudio [URL]` - Get audio information

### Group Commands (Admin Only)
- `.announce [message]` - Make announcement
- `.tagall` - Tag all group members
- `.lockgroup` - Restrict group access
- `.unlockgroup` - Remove group restrictions
- `.kick [phone_number]` - Remove user

### Owner Commands
- `.broadcast [message]` - Send to all users
- `.restart` - Restart the bot
- `.addadmin [phone_number]` - Add new admin
- `.cleardata` - Reset bot database

## ⚙️ Configuration

### Admin Settings
Update admin numbers in `index.js`:
```javascript
const CONFIG = {
    OWNER_NUMBER: '2348088866878',
    ADMIN_NUMBERS: ['2348088866878', '2349057938488']
};
```

### Feature Toggle
Enable/disable features:
```javascript
botData.features = {
    stockCount: true,
    creativeHub: true,
    gamesArena: true,
    utilityCenter: true,
    youtubeCommands: true,
    masterSwitch: true
};
```

## 📁 File Structure

```
whatsapp-job-bot/
├── index.js              # Main bot file
├── package.json          # Dependencies and scripts
├── railway.json          # Railway deployment config
├── auth_info/            # WhatsApp session data
└── data/                 # Bot data storage
    ├── features.json     # Feature settings
    ├── userSessions.json # User sessions
    ├── gameData.json     # Game statistics
    └── backups/          # Automatic backups
```

## 🔒 Security Features

- **Admin verification** - Multiple admin levels (Owner > Admin > User)
- **Session timeout** - Auto-logout after 5 minutes
- **Group admin checks** - Restrict group commands
- **Data backup** - Automatic data backup every 30 minutes

## 🎯 Stock Count Feature

The bot automatically:
1. **Detects** messages containing "new stock count"
2. **Reacts** with 👍 emoji immediately
3. **Tracks** total reaction count
4. **Notifies** when 10 reactions are reached
5. **Stores** data persistently

## 🎮 Gaming System

- **Rock Paper Scissors** - Play against bot with scoring
- **Number Guessing** - 7 attempts to guess 1-100
- **Trivia Quiz** - Answer multiple choice questions
- **Leaderboards** - Global and group-based scoring

## 🛠️ Troubleshooting

### Common Issues

**Bot not responding:**
- Check if QR code was scanned properly
- Verify WhatsApp Web is connected
- Restart the bot with `npm start`

**Missing features:**
- Ensure all dependencies are installed
- Check if feature is enabled in admin panel
- Verify admin permissions

**Railway deployment fails:**
- Check Railway logs for errors
- Ensure `package.json` is correct
- Verify Node.js version compatibility

## 📊 Analytics

The bot tracks:
- **Command usage** - Most used features
- **User activity** - Active users and sessions
- **Group statistics** - Group interactions
- **Game performance** - Scores and leaderboards

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is open source. Feel free to use and modify.

## 📞 Support

For issues or questions:
- Create an issue on GitHub
- Contact the owner via WhatsApp

## ⚠️ Disclaimer

- This bot is for educational purposes
- Use responsibly and follow WhatsApp Terms of Service
- Respect user privacy and group rules


```text
  ,__ __                                    _        _                
 /|  |  |           |                o     | |      | |               
  |  |  |   __,   __|   _              _|_ | |      | |  __        _  
  |  |  |  /  |  /  |  |/    |  |  |_|  |  |/ \     |/  /  \_|  |_|/  
  |  |  |_/\_/|_/\_/|_/|__/   \/ \/  |_/|_/|   |_/  |__/\__/  \/  |__/
                                                                      
                                                                      
