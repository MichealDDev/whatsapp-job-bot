const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('🚀 Starting WhatsApp Job Bot...');

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "job-bot"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Important for Railway's memory limits
            '--disable-gpu'
        ]
    }
});

// CHANGE THIS TO YOUR ACTUAL GROUP NAME
const TARGET_GROUP_NAME = process.env.GROUP_NAME || 'Jobs Group'; 

// QR Code for first setup
client.on('qr', (qr) => {
    console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP:');
    console.log('====================================');
    qrcode.generate(qr, { small: true });
    console.log('====================================');
    console.log('Open WhatsApp → Settings → Linked Devices → Link a Device');
});

// Bot ready
client.on('ready', () => {
    console.log('✅ WhatsApp Job Bot is READY!');
    console.log(`🎯 Monitoring group: "${TARGET_GROUP_NAME}"`);
    console.log('Bot will automatically like all messages in this group');
});

// Main message handler
client.on('message', async (message) => {
    try {
        const chat = await message.getChat();
        
        // Only process group messages
        if (!chat.isGroup) return;
        
        // Check if it's our target group
        if (chat.name === TARGET_GROUP_NAME) {
            console.log(`📨 NEW JOB POST: "${message.body.substring(0, 50)}..."`);
            console.log(`👤 From: ${message.author ? message.author.split('@')[0] : 'Admin'}`);
            
            // Auto-react with thumbs up
            await message.react('👍');
            console.log('✅ AUTO-LIKED successfully!');
            
            // Log with timestamp
            const timestamp = new Date().toLocaleString();
            console.log(`[${timestamp}] ✅ Reacted to job posting`);
        }
        
    } catch (error) {
        console.error('❌ Error processing message:', error.message);
    }
});

// Connection issues handler
client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp disconnected:', reason);
    console.log('🔄 Bot will attempt to reconnect...');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    console.log('📱 You may need to scan the QR code again');
});

// Start the bot
client.initialize();

// Keep alive for Railway (restarts every 12 hours to manage resources)
setInterval(() => {
    console.log('🔄 Restarting bot to manage memory (Railway optimization)');
    process.exit(0); // Railway will automatically restart
}, 12 * 60 * 60 * 1000); // 12 hours

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Bot shutting down...');
    client.destroy();
});

console.log('⏳ Initializing WhatsApp connection...');
