const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, '../points.json');
const CODING_QUESTION_FILE = path.join(__dirname, '../codingQuestions.json');

// Load points data
function loadPoints() {
    if (fs.existsSync(POINTS_FILE)) {
        return JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
    }
    return {};
}

// Save points data
function savePoints(points) {
    fs.writeFileSync(POINTS_FILE, JSON.stringify(points, null, 2));
}

// Load coding questions data
function loadCodingQuestions() {
    if (fs.existsSync(CODING_QUESTION_FILE)) {
        return JSON.parse(fs.readFileSync(CODING_QUESTION_FILE, 'utf8'));
    }
    return {};
}

// Save coding questions data
function saveCodingQuestions(data) {
    fs.writeFileSync(CODING_QUESTION_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
    handleCodingQuestions: (client) => {
        const VIBE_CODING_CHANNEL_ID = '1362052133570220123'; // Vibe Coding channel
        const CORRECT_ANSWER_EMOJI = '✅';

        // Track answers that have been auto-verified
        const autoVerifiedAnswers = new Set();

        console.log('✓ Coding questions handler loaded (Channel: ' + VIBE_CODING_CHANNEL_ID + ')');

        // Automatically react with ✅ to answers posted in Vibe Coding channel
        client.on('messageCreate', async (message) => {
            // Ignore bot messages
            if (message.author.bot) return;

            // Only track messages in Vibe Coding channel
            if (message.channelId !== VIBE_CODING_CHANNEL_ID) return;

            // Ignore if message is too short (likely not an answer)
            if (message.content.length < 5) return;

            try {
                console.log(`[VibeCoding] New message from ${message.author.username}: ${message.content.substring(0, 50)}...`);

                // Add ✅ reaction to the message
                await message.react(CORRECT_ANSWER_EMOJI);
                console.log(`[VibeCoding] ✅ Auto-reacted to ${message.author.username}'s answer`);

                // Award 5 points to the answer author
                const points = loadPoints();
                const pointsToAward = 5;

                if (!points[message.author.id]) {
                    points[message.author.id] = {
                        username: message.author.username,
                        points: 0,
                        lastUpdate: new Date().toISOString()
                    };
                }

                points[message.author.id].points += pointsToAward;
                points[message.author.id].lastUpdate = new Date().toISOString();

                savePoints(points);
                autoVerifiedAnswers.add(message.id);

                console.log(`[VibeCoding] ✓ AWARDED ${pointsToAward} points to ${message.author.username}! Total: ${points[message.author.id].points}`);

                // Send confirmation reply
                try {
                    await message.reply({
                        content: `✅ **Answer Verified!**\n**${message.author.username}** earned **+${pointsToAward} points** 🎉\nTotal Points: **${points[message.author.id].points}**`
                    });
                    console.log(`[VibeCoding] Confirmation reply sent`);
                } catch (error) {
                    console.error('[VibeCoding] Could not send reply:', error.message);
                }

                // Save to coding questions data
                const questions = loadCodingQuestions();
                if (!questions[message.id]) {
                    questions[message.id] = {
                        messageId: message.id,
                        channelId: VIBE_CODING_CHANNEL_ID,
                        answeredBy: message.author.username,
                        answeredAt: message.createdAt.toISOString(),
                        pointsAwarded: pointsToAward,
                        content: message.content.substring(0, 300)
                    };
                }
                saveCodingQuestions(questions);

            } catch (error) {
                console.error('[VibeCoding] Error processing answer:', error.message);
            }
        });
    }
};
