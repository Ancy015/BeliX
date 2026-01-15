const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, '../points.json');
const MEETING_ATTENDANCE_FILE = path.join(__dirname, '../meetingAttendance.json');

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

// Load meeting attendance data
function loadMeetingAttendance() {
    if (fs.existsSync(MEETING_ATTENDANCE_FILE)) {
        return JSON.parse(fs.readFileSync(MEETING_ATTENDANCE_FILE, 'utf8'));
    }
    return {};
}

// Save meeting attendance data
function saveMeetingAttendance(data) {
    fs.writeFileSync(MEETING_ATTENDANCE_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
    handleMeetingAttendance: (client) => {
        const MEETING_CHANNEL_ID = '1304848107095326830'; // common hall
        const ATTENDANCE_EMOJI = '✅';

        console.log('✓ Meeting attendance handler loaded');

        client.on('messageReactionAdd', async (reaction, user) => {
            // Ignore bot reactions
            if (user.bot) return;

            try {
                // Only track reactions in the meeting channel
                if (reaction.message.channelId !== MEETING_CHANNEL_ID) return;

                // Only track ✅ emoji
                if (reaction.emoji.name !== ATTENDANCE_EMOJI) return;

                // Fetch full reaction if needed
                if (reaction.partial) {
                    await reaction.fetch();
                }

                const meetingData = loadMeetingAttendance();
                const messageId = reaction.message.id;
                const userId = user.id;

                // Initialize meeting if not exists
                if (!meetingData[messageId]) {
                    meetingData[messageId] = {
                        messageId: messageId,
                        startTime: new Date().toISOString(),
                        attendees: {}
                    };
                }

                // Record attendance start time for this user
                meetingData[messageId].attendees[userId] = {
                    username: user.username,
                    joinTime: new Date().toISOString(),
                    leaveTime: null,
                    durationMinutes: 0,
                    pointsAwarded: 0
                };

                saveMeetingAttendance(meetingData);

                console.log(`✓ ${user.username} checked in to meeting (${messageId})`);

                try {
                    await reaction.message.reply({
                        content: `✅ **${user.username}** has checked in to the meeting! Attendance is being tracked.`
                    });
                } catch (error) {
                    console.error('Could not send reply:', error.message);
                }

            } catch (error) {
                console.error('Error handling meeting attendance reaction:', error);
            }
        });

        client.on('messageReactionRemove', async (reaction, user) => {
            // Ignore bot reactions
            if (user.bot) return;

            try {
                // Only track reactions in the meeting channel
                if (reaction.message.channelId !== MEETING_CHANNEL_ID) return;

                // Only track ✅ emoji
                if (reaction.emoji.name !== ATTENDANCE_EMOJI) return;

                // Fetch full reaction if needed
                if (reaction.partial) {
                    await reaction.fetch();
                }

                const meetingData = loadMeetingAttendance();
                const messageId = reaction.message.id;
                const userId = user.id;

                // Check if user is in attendance
                if (!meetingData[messageId] || !meetingData[messageId].attendees[userId]) {
                    return;
                }

                const attendance = meetingData[messageId].attendees[userId];
                const joinTime = new Date(attendance.joinTime);
                const leaveTime = new Date();

                // Calculate duration in minutes
                const durationMinutes = Math.floor((leaveTime - joinTime) / 60000);

                // Determine points based on duration
                let pointsToAward = 0;
                if (durationMinutes >= 60) {
                    pointsToAward = 5; // 1 hour or more
                } else if (durationMinutes >= 10) {
                    pointsToAward = 3; // 10-30 min (including up to 60)
                }

                // Update attendance record
                attendance.leaveTime = leaveTime.toISOString();
                attendance.durationMinutes = durationMinutes;
                attendance.pointsAwarded = pointsToAward;

                saveMeetingAttendance(meetingData);

                // Award points if duration qualifies
                if (pointsToAward > 0) {
                    const points = loadPoints();

                    if (!points[userId]) {
                        points[userId] = {
                            username: user.username,
                            points: 0,
                            lastUpdate: new Date().toISOString()
                        };
                    }

                    points[userId].points += pointsToAward;
                    points[userId].lastUpdate = new Date().toISOString();

                    savePoints(points);

                    console.log(`✓ Awarded ${pointsToAward} points to ${user.username} for ${durationMinutes} min meeting attendance! Total: ${points[userId].points}`);

                    try {
                        await reaction.message.reply({
                            content: `✅ **Meeting Attendance Recorded!**\n**${user.username}** attended for **${durationMinutes} minutes**\nYou earned **+${pointsToAward} points**!`
                        });
                    } catch (error) {
                        console.error('Could not send reply:', error.message);
                    }
                } else {
                    console.log(`✗ ${user.username} attended for only ${durationMinutes} minutes (minimum 10 minutes required)`);

                    try {
                        await reaction.message.reply({
                            content: `⏱️ **Attendance Too Short**\n**${user.username}** attended for only **${durationMinutes} minutes**\nMinimum 10 minutes required to earn points.`
                        });
                    } catch (error) {
                        console.error('Could not send reply:', error.message);
                    }
                }

            } catch (error) {
                console.error('Error handling meeting checkout:', error);
            }
        });
    }
};
