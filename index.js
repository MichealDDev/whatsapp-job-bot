const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs').promises;
const path = require('path');

// Create logger
const logger = P({ level: 'silent' });

// Reaction counter storage
const COUNTER_FILE = path.join(__dirname, 'reaction_counters.json');
let reactionCounters = {};

// Load existing counters from file
async function loadCounters() {
    try {
        const data = await fs.readFile(COUNTER_FILE, 'utf8');
        reactionCounters = JSON.parse(data);
        console.log('📊 Loaded existing reaction counters');
    } catch (error) {
        console.log('📊 No existing counters found, starting fresh');
        reactionCounters = {};
    }
}

// Save counters to file
async function saveCounters() {
    try {
        await fs.writeFile(COUNTER_FILE, JSON.stringify(reactionCounters, null, 2));
    } catch (error) {
        console.error('❌ Error saving counters:', error);
    }
}

// Generate unique key for message
function getMessageKey(msg) {
    return `${msg.key.remoteJid}_${msg.key.id}`;
}

// Check if message contains "new stock count" (case insensitive)
function isStockCountMessage(text) {
    if (!text) return false;
    return text.toLowerCase().includes('new stock count');
}

async function startBot() {
    // Load existing reaction counters
    await loadCounters();
    
    // Use multi-file auth state to save session
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: false, // We'll handle QR code display manually
        browser: ["WhatsApp Bot", "Chrome", "1.0.0"], // Identify as a bot
    });

    // Handle QR code display
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed due to ', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(startBot, 3000); // Restart after 3 seconds
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp bot connected successfully!');
            console.log('🤖 Bot is now ready to receive messages');
        }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Function to generate random delay
    const getRandomDelay = (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    // Function to send message with random delay
    const sendMessageWithDelay = async (jid, content, minDelay = 1000, maxDelay = 3000) => {
        const delay = getRandomDelay(minDelay, maxDelay);
        console.log(`⏳ Waiting ${delay}ms before sending message...`);
        
        setTimeout(async () => {
            try {
                await sock.sendMessage(jid, content);
                console.log(`✅ Message sent to ${jid}`);
            } catch (error) {
                console.error(`❌ Error sending message:`, error);
            }
        }, delay);
    };

    // Function to react to message instantly (safe for stock count messages)
    const reactToMessage = async (msg, emoji) => {
        try {
            await sock.sendMessage(msg.key.remoteJid, {
                react: {
                    text: emoji,
                    key: msg.key
                }
            });
            console.log(`👍 Instantly reacted to stock count message with ${emoji}`);
        } catch (error) {
            console.error(`❌ Error reacting to message:`, error);
        }
    };

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            
            // Skip if no message or if it's from us or status broadcast
            if (!msg || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') {
                return;
            }

            // Skip if message object doesn't exist
            if (!msg.message) {
                console.log('⚠️ Received message without message content (possibly a reaction or system message)');
                return;
            }

            const messageType = Object.keys(msg.message)[0];
            console.log(`📩 Received message type: ${messageType}`);
            
            // Only process text messages
            if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
                const sender = msg.key.remoteJid;
                
                console.log(`📨 Message from ${sender}: ${text}`);
                
                // 1. Auto-react to "New stock count" messages (case insensitive)
                if (isStockCountMessage(text)) {
                    console.log('🎯 Detected "New stock count" message - reacting with 👍');
                    await reactToMessage(msg, '👍');
                    
                    // Initialize counter for this message
                    const msgKey = getMessageKey(msg);
                    if (!reactionCounters[msgKey]) {
                        reactionCounters[msgKey] = {
                            count: 0,
                            hasReplied: false,
                            messageText: text.substring(0, 50) + '...' // Store snippet for logging
                        };
                        await saveCounters();
                        console.log(`📊 Initialized counter for message: ${msgKey}`);
                    }
                }
                
                // 2. Reply to .hi command only
                else if (text && text.trim() === '.hi') {
                    console.log('🤖 Responding to .hi command');
                    await sendMessageWithDelay(sender, { 
                        text: '👋 Hello! I\'m a WhatsApp bot. I\'m currently in development mode.' 
                    }, 1000, 2000);
                }
            }
        } catch (error) {
            console.error('❌ Error processing message:', error);
            // Don't crash the bot, just log the error and continue
        }
    });

    // Handle reactions to track stock count reactions
    sock.ev.on('messages.reaction', async (reactions) => {
        try {
            for (const reaction of reactions) {
                const msgKey = `${reaction.key.remoteJid}_${reaction.key.id}`;
                
                // Only process if this is a tracked stock count message
                if (reactionCounters[msgKey]) {
                    console.log(`👍 Reaction ${reaction.reaction.text || 'removed'} on stock count message by ${reaction.key.participant || 'user'}`);
                    
                    // Count current reactions by getting the message
                    try {
                        // Get all reactions for this message
                        let totalReactions = 0;
                        
                        // In Baileys, we need to track reactions manually
                        // Since we can't easily get total count, we'll increment/decrement based on the reaction event
                        if (reaction.reaction.text) {
                            // Reaction added
                            reactionCounters[msgKey].count += 1;
                            console.log(`📈 Reaction added. New count: ${reactionCounters[msgKey].count}`);
                        } else {
                            // Reaction removed (when reaction.text is empty/null)
                            reactionCounters[msgKey].count = Math.max(0, reactionCounters[msgKey].count - 1);
                            console.log(`📉 Reaction removed. New count: ${reactionCounters[msgKey].count}`);
                        }
                        
                        await saveCounters();
                        
                        // Check if we've reached exactly 10 reactions and haven't replied yet
                        if (reactionCounters[msgKey].count === 10 && !reactionCounters[msgKey].hasReplied) {
                            console.log('🎉 Stock count message reached 10 reactions! Sending reply...');
                            
                            // Reply to the original message
                            await sendMessageWithDelay(
                                reaction.key.remoteJid,
                                {
                                    text: 'Number of stock counters reached: 10',
                                    contextInfo: {
                                        stanzaId: reaction.key.id,
                                        participant: reaction.key.participant || undefined,
                                        quotedMessage: {
                                            conversation: reactionCounters[msgKey].messageText
                                        }
                                    }
                                },
                                2000,
                                4000
                            );
                            
                            // Mark as replied
                            reactionCounters[msgKey].hasReplied = true;
                            await saveCounters();
                        }
                        
                    } catch (msgError) {
                        console.error('❌ Error processing reaction count:', msgError);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error processing reactions:', error);
        }
    });

    return sock;
}

// Start the bot
console.log('🚀 Starting WhatsApp bot...');
startBot().catch(err => {
    console.error('❌ Error starting bot:', err);
});

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Bot shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Bot shutting down gracefully...');
    process.exit(0);
});
