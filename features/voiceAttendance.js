const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, '../points.json');
const VOICE_ATTENDANCE_FILE = path.join(__dirname, '../voiceAttendance.json');
const MEETING_STATUS_FILE = path.join(__dirname, '../meetingStatus.json');

// Load points data
function loadPoints() {
    if (fs.existsSync(POINTS_FILE)) {
        try {
            const raw = fs.readFileSync(POINTS_FILE, 'utf8');
            if (!raw || !raw.trim()) return {};
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[VoiceAttendance] Points file invalid, reinitializing');
            return {};
        }
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
        try {
            const raw = fs.readFileSync(VOICE_ATTENDANCE_FILE, 'utf8');
            if (!raw || !raw.trim()) return {};
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[VoiceAttendance] Attendance file invalid, reinitializing');
            return {};
        }
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
        try {
            const raw = fs.readFileSync(MEETING_STATUS_FILE, 'utf8');
            if (!raw || !raw.trim()) return { isActive: false, startTime: null, memberCount: 0 };
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[VoiceAttendance] Meeting status file invalid, using defaults');
            return { isActive: false, startTime: null, memberCount: 0 };
        }
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
        const MEETING_ANNOUNCEMENT_CHANNEL_ID = '1304848106789015647'; // Text channel for announcements
        const MEETING_VOICE_CHANNEL_ID = '1304848107095326830'; // Voice channel for meetings

        // Track user voice session start times and accumulated duration
        const voiceSessions = new Map(); // userId -> { joinTime, channelId, totalMinutes }

        console.log('✓ Voice channel attendance handler loaded');

        // Monitor for meeting announcements in the announcement channel
        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            // Check if message is in the meeting announcement channel
            if (message.channelId !== MEETING_ANNOUNCEMENT_CHANNEL_ID) return;

            // Any message in this channel indicates a meeting is happening
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
        });

        client.on('voiceStateUpdate', async (oldState, newState) => {
            const userId = newState.id;
            const userName = newState.member?.user?.username || 'Unknown';

            try {
                // User joined a voice channel
                if (!oldState.channelId && newState.channelId) {
                    // Only track if joining the meeting voice channel
                    if (newState.channelId === MEETING_VOICE_CHANNEL_ID) {
                        // Check if a meeting is currently active
                        const channel = newState.guild.channels.cache.get(MEETING_VOICE_CHANNEL_ID);
                        
                        if (!isMeetingActive(channel)) {
                            console.log(`ℹ ${userName} joined meeting channel, but no active meeting detected`);
                            return;
                        }

                        const joinTime = new Date();
                        
                        // Check if user already has accumulated time from previous sessions
                        let existingSession = voiceSessions.get(userId);
                        if (!existingSession) {
                            existingSession = {
                                joinTime: joinTime,
                                channelId: newState.channelId,
                                username: userName,
                                totalMinutes: 0
                            };
                        } else {
                            existingSession.joinTime = joinTime;
                        }
                        
                        voiceSessions.set(userId, existingSession);

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
                    if (oldState.channelId === MEETING_VOICE_CHANNEL_ID) {
                        const session = voiceSessions.get(userId);

                        if (session) {
                            const leaveTime = new Date();
                            const currentSessionMinutes = Math.floor((leaveTime - session.joinTime) / 60000);
                            
                            // Add current session time to total accumulated time
                            session.totalMinutes += currentSessionMinutes;
                            const totalMinutes = session.totalMinutes;

                            // Determine points based on TOTAL accumulated duration
                            // 10-30 minutes = 3 points, 30+ minutes = 10 points
                            let pointsToAward = 0;
                            if (totalMinutes >= 30) {
                                pointsToAward = 10; // 30 minutes or more
                            } else if (totalMinutes >= 10) {
                                pointsToAward = 3; // 10-29 minutes
                            }

                            console.log(`✓ ${userName} left the meeting voice channel. Session: ${currentSessionMinutes} min, Total: ${totalMinutes} min`);

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

                                console.log(`✓ AWARDED ${pointsToAward} points to ${userName} for ${totalMinutes} min total meeting time! Total: ${points[userId].points}`);

                            } else {
                                console.log(`✗ ${userName} total attendance ${totalMinutes} minutes (minimum 10 minutes required for points)`);
                            }

                            // Update attendance file
                            const attendance = loadVoiceAttendance();
                            if (attendance[userId] && attendance[userId].sessions.length > 0) {
                                const lastSession = attendance[userId].sessions[attendance[userId].sessions.length - 1];
                                lastSession.leaveTime = leaveTime.toISOString();
                                lastSession.durationMinutes = totalMinutes;
                                lastSession.pointsAwarded = pointsToAward;
                                saveVoiceAttendance(attendance);
                            }

                            // Keep session in memory in case user rejoins (don't delete it)
                            voiceSessions.set(userId, session);
                        }
                    }
                }

                // User switched voice channels
                if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                    // If they left the meeting channel
                    if (oldState.channelId === MEETING_VOICE_CHANNEL_ID) {
                        const session = voiceSessions.get(userId);

                        if (session) {
                            const leaveTime = new Date();
                            const currentSessionMinutes = Math.floor((leaveTime - session.joinTime) / 60000);
                            
                            // Add current session time to total
                            session.totalMinutes += currentSessionMinutes;
                            const totalMinutes = session.totalMinutes;

                            // Determine points based on total duration
                            let pointsToAward = 0;
                            if (totalMinutes >= 30) {
                                pointsToAward = 10;
                            } else if (totalMinutes >= 10) {
                                pointsToAward = 3;
                            }

                            console.log(`✓ ${userName} switched channels (left meeting). Session: ${currentSessionMinutes} min, Total: ${totalMinutes} min`);

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

                                console.log(`✓ AWARDED ${pointsToAward} points to ${userName} for ${totalMinutes} min meeting! Total: ${points[userId].points}`);
                            }

                            voiceSessions.set(userId, session);
                        }
                    }

                    // If they joined the meeting channel
                    if (newState.channelId === MEETING_VOICE_CHANNEL_ID) {
                        // Check if a meeting is currently active
                        const channel = newState.guild.channels.cache.get(MEETING_VOICE_CHANNEL_ID);
                        
                        if (!isMeetingActive(channel)) {
                            console.log(`ℹ ${userName} switched to meeting channel, but no active meeting detected`);
                            return;
                        }

                        const joinTime = new Date();
                        
                        // Check if user already has accumulated time
                        let existingSession = voiceSessions.get(userId);
                        if (!existingSession) {
                            existingSession = {
                                joinTime: joinTime,
                                channelId: newState.channelId,
                                username: userName,
                                totalMinutes: 0
                            };
                        } else {
                            existingSession.joinTime = joinTime;
                        }
                        
                        voiceSessions.set(userId, existingSession);

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
