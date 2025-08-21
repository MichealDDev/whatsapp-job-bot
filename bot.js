const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

console.log('🚀 Starting WhatsApp Job Bot (Baileys)...');

// Your group name from Railway environment variable
const TARGET_GROUP_NAME = process.env.GROUP_NAME || 'MEME COINS';

async function startBot() {
    try {
        // Use multi-file auth state for session persistence
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: {
                level: 'silent' // Reduce log noise
            }
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);

        // Connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom) ? 
                    lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : false;
                
                console.log('⚠️ Connection closed:', lastDisconnect?.error?.message);
                
                if (shouldReconnect) {
                    console.log('🔄 Reconnecting in 5 seconds...');
                    setTimeout(() => startBot(), 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp connection opened successfully');
                console.log(`🎯 Monitoring group: "${TARGET_GROUP_NAME}"`);
                console.log('Bot will auto-react to all messages in this group');
            }
        });

        // Message handler - this is where the magic happens!
        sock.ev.on('messages.upsert', async (messageUpdate) => {
            try {
                const messages = messageUpdate.messages;
                
                for (const message of messages) {
                    // Skip if no message content or if it's our own message
                    if (!message.message || message.key.fromMe) continue;
                    
                    await processMessage(sock, message);
                }
            } catch (error) {
                console.error('❌ Message processing error:', error.message);
            }
        });

        console.log('⏳ Initializing WhatsApp connection...');

    } catch (error) {
        console.error('❌ Bot initialization error:', error);
        console.log('🔄 Retrying in 10 seconds...');
        setTimeout(() => startBot(), 10000);
    }
}

async function processMessage(sock, message) {
    try {
        const messageKey = message.key;
        const remoteJid = messageKey.remoteJid;
        
        // Check if message is from a group
        if (!remoteJid || !remoteJid.includes('@g.us')) {
            return; // Not a group message, ignore
        }

        // Get group info to check the name
        const groupMetadata = await sock.groupMetadata(remoteJid);
        const groupName = groupMetadata.subject;

        // Check if this is our target group
        if (groupName !== TARGET_GROUP_NAME) {
            return; // Not our target group, ignore
        }

        // Extract message text for logging
        let messageText = '';
        const messageContent = message.message;
        
        if (messageContent.conversation) {
            messageText = messageContent.conversation;
        } else if (messageContent.extendedTextMessage) {
            messageText = messageContent.extendedTextMessage.text;
        } else if (messageContent.imageMessage?.caption) {
            messageText = messageContent.imageMessage.caption;
        } else {
            messageText = '[Media message]';
        }

        console.log(`📨 NEW MESSAGE in ${groupName}: "${messageText.substring(0, 50)}..."`);
        console.log(`👤 From: ${messageKey.participant?.split('@')[0] || 'Admin'}`);

        // Auto-react with thumbs up
        await sock.sendMessage(remoteJid, {
            react: {
                text: '👍',
                key: messageKey
            }
        });

        console.log('✅ AUTO-LIKED successfully!');
        
        // Log with timestamp
        const timestamp = new Date().toLocaleString();
        console.log(`[${timestamp}] ✅ Reacted to message in ${groupName}`);

    } catch (error) {
        console.error('❌ Error processing message:', error.message);
        
        // If reaction fails, try sending a message instead
        try {
            await sock.sendMessage(message.key.remoteJid, {
                text: 'Interested! 👍'
            });
            console.log('✅ Sent interest message as fallback');
        } catch (fallbackError) {
            console.error('❌ Fallback message also failed:', fallbackError.message);
        }
    }
}

// Start the bot
startBot();

// Restart every 6 hours to manage memory on Railway
setInterval(() => {
    console.log('🔄 Restarting bot for memory management...');
    process.exit(0); // Railway will automatically restart
}, 6 * 60 * 60 * 1000);

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});
