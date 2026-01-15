const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, '../points.json');
const VOICE_ATTENDANCE_FILE = path.join(__dirname, '../voiceAttendance.json');
const MEETING_STATUS_FILE = path.join(__dirname, '../meetingStatus.json');

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

// Load voice attendance data
function loadVoiceAttendance() {
    if (fs.existsSync(VOICE_ATTENDANCE_FILE)) {
        return JSON.parse(fs.readFileSync(VOICE_ATTENDANCE_FILE, 'utf8'));
    }
    return {};
}

// Save voice attendance data
function saveVoiceAttendance(data) {
    fs.writeFileSync(VOICE_ATTENDANCE_FILE, JSON.stringify(data, null, 2));
}

// Load meeting status data
function loadMeetingStatus() {
    if (fs.existsSync(MEETING_STATUS_FILE)) {
        return JSON.parse(fs.readFileSync(MEETING_STATUS_FILE, 'utf8'));
    }
    return { isActive: false, startTime: null, memberCount: 0 };
}

// Save meeting status
function saveMeetingStatus(data) {
    fs.writeFileSync(MEETING_STATUS_FILE, JSON.stringify(data, null, 2));
}

// Check if a meeting is currently active
function isMeetingActive(channel) {
    if (!channel) return false;

    // Check if more than 5 members are in the channel
    const memberCount = channel.members?.size || 0;
    if (memberCount > 5) {
        return true;
    }

    // Check if meeting was recently announced (within last 30 minutes)
    const meetingStatus = loadMeetingStatus();
    if (meetingStatus.isActive && meetingStatus.startTime) {
        const timeSinceAnnounce = Date.now() - new Date(meetingStatus.startTime).getTime();
        const thirtyMinutesInMs = 30 * 60 * 1000;
        if (timeSinceAnnounce < thirtyMinutesInMs) {
            return true;
        }
    }

    return false;
}

module.exports = {
    handleVoiceChannelAttendance: (client) => {
        const MEETING_CHANNEL_ID = '1304848107095326830'; // common hall voice channel

        // Track user voice session start times
        const voiceSessions = new Map(); // userId -> { joinTime, channelId }

        console.log('✓ Voice channel attendance handler loaded');

        // Monitor for "meeting is live" messages in the meeting channel
        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            // Check if message is in the meeting channel text channel
            if (message.channelId !== MEETING_CHANNEL_ID) return;

            // Check if message contains "meeting is live" keywords
            const messageContent = message.content.toLowerCase();
            if (messageContent.includes('meeting is live') || 
                messageContent.includes('meeting live') ||
                messageContent.includes('meeting started')) {
                
                const meetingStatus = {
                    isActive: true,
                    startTime: new Date().toISOString(),
                    announcer: message.author.username
                };

                saveMeetingStatus(meetingStatus);
                console.log(`✓ Meeting announced by ${message.author.username} - Attendance tracking enabled!`);

                try {
                    await message.react('✅');
                } catch (error) {
                    console.log('Could not add reaction:', error.message);
                }
            }
        });

        client.on('voiceStateUpdate', async (oldState, newState) => {
            const userId = newState.id;
            const userName = newState.member?.user?.username || 'Unknown';

            try {
                // User joined a voice channel
                if (!oldState.channelId && newState.channelId) {
                    // Only track if joining the meeting channel
                    if (newState.channelId === MEETING_CHANNEL_ID) {
                        // Check if a meeting is currently active
                        const channel = newState.guild.channels.cache.get(MEETING_CHANNEL_ID);
                        
                        if (!isMeetingActive(channel)) {
                            console.log(`ℹ ${userName} joined meeting channel, but no active meeting detected`);
                            return;
                        }

                        const joinTime = new Date();
                        voiceSessions.set(userId, {
                            joinTime: joinTime,
                            channelId: newState.channelId,
                            username: userName
                        });

                        console.log(`✓ ${userName} joined the meeting voice channel (TRACKING STARTED)`);

                        // Save to file for persistence
                        const attendance = loadVoiceAttendance();
                        if (!attendance[userId]) {
                            attendance[userId] = {
                                username: userName,
                                sessions: []
                            };
                        }

                        attendance[userId].sessions.push({
                            joinTime: joinTime.toISOString(),
                            leaveTime: null,
                            durationMinutes: 0,
                            pointsAwarded: 0
                        });

                        saveVoiceAttendance(attendance);
                    }
                }

                // User left a voice channel
                if (oldState.channelId && !newState.channelId) {
                    // Check if they were in the meeting channel
                    if (oldState.channelId === MEETING_CHANNEL_ID) {
                        const session = voiceSessions.get(userId);

                        if (session) {
                            const leaveTime = new Date();
                            const durationMinutes = Math.floor((leaveTime - session.joinTime) / 60000);

                            // Determine points based on duration
                            // 10-30 min = 3 points, 30+ min = 5 points
                            let pointsToAward = 0;
                            if (durationMinutes >= 30) {
                                pointsToAward = 5; // 30 minutes or more
                            } else if (durationMinutes >= 10) {
                                pointsToAward = 3; // 10-29 minutes
                            }

                            console.log(`✓ ${userName} left the meeting voice channel after ${durationMinutes} minutes`);

                            // Award points if duration qualifies
                            if (pointsToAward > 0) {
                                const points = loadPoints();

                                if (!points[userId]) {
                                    points[userId] = {
                                        username: userName,
                                        points: 0,
                                        lastUpdate: new Date().toISOString()
                                    };
                                }

                                points[userId].points += pointsToAward;
                                points[userId].lastUpdate = new Date().toISOString();

                                savePoints(points);

                                console.log(`✓ Awarded ${pointsToAward} points to ${userName} for ${durationMinutes} min voice meeting! Total: ${points[userId].points}`);

                                // Try to send DM to user
                                try {
                                    const user = await client.users.fetch(userId);
                                    await user.send({
                                        content: `🎤 **Meeting Attendance Recorded!**\nYou attended the voice meeting for **${durationMinutes} minutes**\nYou earned **+${pointsToAward} points**!\nTotal Points: **${points[userId].points}**`
                                    });
                                } catch (error) {
                                    console.log(`Could not send DM to ${userName}:`, error.message);
                                }
                            } else {
                                console.log(`✗ ${userName} attended for only ${durationMinutes} minutes (minimum 10 minutes required for points)`);
                            }

                            // Update attendance file
                            const attendance = loadVoiceAttendance();
                            if (attendance[userId] && attendance[userId].sessions.length > 0) {
                                const lastSession = attendance[userId].sessions[attendance[userId].sessions.length - 1];
                                lastSession.leaveTime = leaveTime.toISOString();
                                lastSession.durationMinutes = durationMinutes;
                                lastSession.pointsAwarded = pointsToAward;
                                saveVoiceAttendance(attendance);
                            }

                            // Remove from active sessions
                            voiceSessions.delete(userId);
                        }
                    }
                }

                // User switched voice channels
                if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                    // If they left the meeting channel
                    if (oldState.channelId === MEETING_CHANNEL_ID) {
                        const session = voiceSessions.get(userId);

                        if (session) {
                            const leaveTime = new Date();
                            const durationMinutes = Math.floor((leaveTime - session.joinTime) / 60000);

                            // Determine points based on duration
                            let pointsToAward = 0;
                            if (durationMinutes >= 30) {
                                pointsToAward = 5;
                            } else if (durationMinutes >= 10) {
                                pointsToAward = 3;
                            }

                            console.log(`✓ ${userName} switched channels (left meeting after ${durationMinutes} minutes)`);

                            // Award points if duration qualifies
                            if (pointsToAward > 0) {
                                const points = loadPoints();

                                if (!points[userId]) {
                                    points[userId] = {
                                        username: userName,
                                        points: 0,
                                        lastUpdate: new Date().toISOString()
                                    };
                                }

                                points[userId].points += pointsToAward;
                                points[userId].lastUpdate = new Date().toISOString();

                                savePoints(points);

                                console.log(`✓ Awarded ${pointsToAward} points to ${userName} for ${durationMinutes} min meeting! Total: ${points[userId].points}`);
                            }

                            voiceSessions.delete(userId);
                        }
                    }

                    // If they joined the meeting channel
                    if (newState.channelId === MEETING_CHANNEL_ID) {
                        // Check if a meeting is currently active
                        const channel = newState.guild.channels.cache.get(MEETING_CHANNEL_ID);
                        
                        if (!isMeetingActive(channel)) {
                            console.log(`ℹ ${userName} switched to meeting channel, but no active meeting detected`);
                            return;
                        }

                        const joinTime = new Date();
                        voiceSessions.set(userId, {
                            joinTime: joinTime,
                            channelId: newState.channelId,
                            username: userName
                        });

                        console.log(`✓ ${userName} joined the meeting voice channel (TRACKING STARTED)`);

                        const attendance = loadVoiceAttendance();
                        if (!attendance[userId]) {
                            attendance[userId] = {
                                username: userName,
                                sessions: []
                            };
                        }

                        attendance[userId].sessions.push({
                            joinTime: joinTime.toISOString(),
                            leaveTime: null,
                            durationMinutes: 0,
                            pointsAwarded: 0
                        });

                        saveVoiceAttendance(attendance);
                    }
                }

            } catch (error) {
                console.error('Error handling voice state update:', error);
            }
        });
    }
};
