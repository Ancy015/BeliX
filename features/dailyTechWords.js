const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const TECH_WORDS_FILE = path.join(__dirname, '../techWords.json');
const CLAN_CHANNEL_ID = '1304848106789015648'; // Tech words channel

// Load tech words database
function loadTechWords() {
    if (fs.existsSync(TECH_WORDS_FILE)) {
        return JSON.parse(fs.readFileSync(TECH_WORDS_FILE, 'utf8'));
    }
    return null;
}

// Get random words from different categories
function getRandomTechWords() {
    const techWords = loadTechWords();
    if (!techWords) {
        console.error('[DailyTechWords] ❌ Tech words database not found!');
        return null;
    }

    const categories = Object.keys(techWords);
    const selectedWords = [];
    const usedCategories = new Set();

    // Select 2 words from different categories
    while (selectedWords.length < 2 && usedCategories.size < categories.length) {
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        
        if (!usedCategories.has(randomCategory)) {
            const categoryWords = techWords[randomCategory];
            const randomWord = categoryWords[Math.floor(Math.random() * categoryWords.length)];
            
            selectedWords.push({
                ...randomWord,
                category: randomCategory
            });
            
            usedCategories.add(randomCategory);
        }
    }

    return selectedWords;
}

// Format the message
function formatTechWordsMessage(words) {
    let message = '📘 **Daily Tech Words**\n\n';

    words.forEach((wordData, index) => {
        const emoji = index === 0 ? '1️⃣' : '2️⃣';
        message += `${emoji} **${wordData.word}** – ${wordData.definition}\n`;
        message += `💡 Example: ${wordData.example}\n\n`;
    });

    message += '_Keep learning, keep growing! 🚀_';
    
    return message;
}

// Post daily tech words
async function postDailyTechWords(client) {
    try {
        const channel = await client.channels.fetch(CLAN_CHANNEL_ID);
        
        if (!channel) {
            console.error('[DailyTechWords] ❌ Channel not found!');
            return;
        }

        const words = getRandomTechWords();
        
        if (!words || words.length < 2) {
            console.error('[DailyTechWords] ❌ Failed to get random words');
            return;
        }

        const message = formatTechWordsMessage(words);
        
        await channel.send(message);
        
        console.log(`[DailyTechWords] ✅ Posted daily tech words: ${words[0].word}, ${words[1].word}`);
        
    } catch (error) {
        console.error('[DailyTechWords] ❌ Error posting tech words:', error.message);
    }
}

// Calculate milliseconds until next 7:00 AM
function getMillisecondsUntil7AM() {
    const now = new Date();
    const next7AM = new Date();
    
    next7AM.setHours(7, 0, 0, 0);
    
    // If it's already past 7 AM today, schedule for tomorrow
    if (now.getHours() >= 7) {
        next7AM.setDate(next7AM.getDate() + 1);
    }
    
    return next7AM - now;
}

// Setup daily tech words feature
function handleDailyTechWords(client) {
    console.log('✓ Daily Tech Words handler loaded (Posts at 7:00 AM daily)');

    // Schedule first posting
    const scheduleNextPosting = () => {
        const msUntil7AM = getMillisecondsUntil7AM();
        const hoursUntil = (msUntil7AM / (1000 * 60 * 60)).toFixed(1);
        
        console.log(`[DailyTechWords] ⏰ Next post scheduled in ${hoursUntil} hours`);
        
        setTimeout(async () => {
            await postDailyTechWords(client);
            
            // Schedule next day's posting
            scheduleNextPosting();
        }, msUntil7AM);
    };

    // Wait for bot to be ready
    client.once('ready', () => {
        console.log('[DailyTechWords] 🚀 Initializing daily schedule...');
        scheduleNextPosting();
    });
}

module.exports = {
    handleDailyTechWords,
    postDailyTechWords // Export for manual testing
};
