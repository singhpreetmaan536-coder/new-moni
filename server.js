const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 5000;
const MONITOR_FILE = path.join(__dirname, 'monitors.json');

// username -> { interval, startedAt, lastStatus }
const monitors = new Map();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function decodeHTMLEntities(text) {
    if (!text) return "";

    return text
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
            String.fromCodePoint(parseInt(hex, 16))
        )
        .replace(/&#(\d+);/g, (_, num) =>
            String.fromCodePoint(num)
        )
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
}


// ======================================================
// INSTAGRAM CHECK
// ======================================================

async function checkInstagram(username) {

    username = username
        .trim()
        .toLowerCase()
        .replace('@', '');

    // ==================================================
    // METHOD 1
    // ==================================================

    try {

        const headers = {
            "x-ig-app-id": "936619743392459",

            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",

            "Accept": "*/*",

            "Referer":
                "https://www.instagram.com/"
        };


        const response = await axios.get(

            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,

            {
                headers,
                timeout: 12000,
                validateStatus: () => true
            }

        );


        if (
            response.status === 200 &&
            response.data?.data?.user
        ) {

            const user =
                response.data.data.user;


            return {

                exists: true,

                status: "ACTIVE",

                user: {

                    full_name:
                        user.full_name ||
                        username,

                    username:
                        user.username,

                    biography:
                        user.biography ||
                        "",

                    followers:
                        user.edge_followed_by?.count ||
                        0,

                    following:
                        user.edge_follow?.count ||
                        0,

                    posts:
                        user.edge_owner_to_timeline_media?.count ||
                        0,

                    profile_pic:
                        user.profile_pic_url_hd ||
                        user.profile_pic_url ||
                        ""

                }

            };

        }

    } catch (e) {

        // Continue to method 2

    }


    // ==================================================
    // METHOD 2 - PUBLIC PAGE
    // ==================================================

    try {

        const pageRes = await axios.get(

            `https://www.instagram.com/${username}/`,

            {

                headers: {

                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

                },

                timeout: 12000

            }

        );


        const html =
            pageRes.data;


        if (
            html.includes("og:title") ||
            html.includes(
                `"username":"${username}"`
            )
        ) {

            let fullName =
                username;

            let biography =
                "";

            let profilePic =
                "";

            let followers =
                "—";

            let following =
                "—";

            let posts =
                "—";


            // ------------------------------------------
            // NAME
            // ------------------------------------------

            const titleMatch =
                html.match(
                    /property="og:title" content="([^"]+)"/i
                );


            if (titleMatch) {

                fullName =
                    decodeHTMLEntities(
                        titleMatch[1]
                            .split('(')[0]
                            .trim()
                    );

            }


            // ------------------------------------------
            // DESCRIPTION
            // ------------------------------------------

            const descMatch =
                html.match(
                    /property="og:description" content="([^"]+)"/i
                );


            if (descMatch) {

                let raw =
                    decodeHTMLEntities(
                        descMatch[1]
                    );


                raw =
                    raw
                        .split(
                            " - See Instagram"
                        )[0]
                        .trim();


                biography =
                    raw;


                const nums =
                    raw.match(
                        /([\d,.]+[KMB]?)\s+Followers.*?([\d,.]+[KMB]?)\s+Following.*?([\d,.]+[KMB]?)\s+Posts/i
                    );


                if (nums) {

                    followers =
                        nums[1];

                    following =
                        nums[2];

                    posts =
                        nums[3];

                }

            }


            // ------------------------------------------
            // PROFILE PICTURE
            // ------------------------------------------

            const picMatch =
                html.match(
                    /property="og:image" content="([^"]+)"/i
                );


            if (picMatch) {

                profilePic =
                    picMatch[1];

            }


            return {

                exists: true,

                status: "ACTIVE",

                user: {

                    full_name:
                        fullName,

                    username:
                        username,

                    biography:
                        biography,

                    followers:
                        followers,

                    following:
                        following,

                    posts:
                        posts,

                    profile_pic:
                        profilePic

                }

            };

        }

    } catch (e) {

        // Return banned below

    }


    return {

        exists: false,

        status: "BANNED"

    };

}


// ======================================================
// EXISTING /api/check API
// ======================================================

app.post('/api/check', async (req, res) => {

    let { username } =
        req.body;


    if (!username) {

        return res.json({

            exists: false,

            status: "BANNED"

        });

    }


    const result =
        await checkInstagram(username);


    return res.json(result);

});


// ======================================================
// SAVE MONITORS
// ======================================================

function saveMonitors() {

    try {

        const data =
            [...monitors.entries()]
                .map(([username, monitor]) => ({

                    username,

                    startedAt:
                        monitor.startedAt,

                    lastStatus:
                        monitor.lastStatus

                }));


        fs.writeFileSync(

            MONITOR_FILE,

            JSON.stringify(
                data,
                null,
                2
            )

        );

    } catch (e) {

        console.error(
            '❌ Failed to save monitors:',
            e.message
        );

    }

}


// ======================================================
// FORMAT TIMER
// ======================================================

function formatElapsed(ms) {

    const totalSeconds =
        Math.max(
            0,
            Math.floor(ms / 1000)
        );


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );


    const seconds =
        totalSeconds % 60;


    return [

        String(hours)
            .padStart(2, '0'),

        String(minutes)
            .padStart(2, '0'),

        String(seconds)
            .padStart(2, '0')

    ].join(':');

}


// ======================================================
// MONITOR CHECK
// ======================================================

async function performMonitorCheck(username) {

    const monitor =
        monitors.get(username);


    if (!monitor) return;


    try {

        const data =
            await checkInstagram(
                username
            );


        const newStatus =
            data.status === 'ACTIVE'
                ? 'ACTIVE'
                : 'BANNED';


        // First check
        if (
            monitor.lastStatus === null
        ) {

            monitor.lastStatus =
                newStatus;


            saveMonitors();


            console.log(
                `[MONITOR] @${username} -> ${newStatus}`
            );


            return;

        }


        // ==================================================
        // STATUS CHANGED
        // ==================================================

        if (
            monitor.lastStatus !==
            newStatus
        ) {

            const elapsed =
                Date.now() -
                monitor.startedAt;


            console.log('');

            console.log(
                `🔔 @${username} STATUS CHANGED: ${monitor.lastStatus} → ${newStatus}`
            );

            console.log(
                `⏱️ Time taken from monitoring start: ${formatElapsed(elapsed)}`
            );

            console.log('');


            monitor.lastStatus =
                newStatus;


            saveMonitors();


        } else {

            console.log(
                `[MONITOR] @${username} -> ${newStatus}`
            );

        }


    } catch (e) {

        console.log(
            `[MONITOR] @${username} -> API ERROR`
        );

    }

}


// ======================================================
// START BACKEND MONITOR
// ======================================================

function startMonitor(
    username,
    saved = false,
    savedData = null
) {

    username =
        username
            .trim()
            .toLowerCase()
            .replace('@', '');


    if (!username)
        return false;


    // Already running
    if (
        monitors.has(username)
    ) {

        return false;

    }


    const monitor = {

        interval: null,

        startedAt:
            savedData?.startedAt ||
            Date.now(),

        lastStatus:
            savedData?.lastStatus ??
            null

    };


    monitors.set(
        username,
        monitor
    );


    // Check every 3 seconds

    monitor.interval =
        setInterval(() => {

            performMonitorCheck(
                username
            );

        }, 3000);


    console.log(
        `👁️ Backend monitoring ${
            saved
                ? 'restored'
                : 'started'
        }: @${username}`
    );


    // Immediate first check

    performMonitorCheck(
        username
    );


    if (!saved) {

        saveMonitors();

    }


    return true;

}


// ======================================================
// STOP BACKEND MONITOR
// ======================================================

function stopMonitor(username) {

    username =
        username
            .trim()
            .toLowerCase()
            .replace('@', '');


    const monitor =
        monitors.get(username);


    if (!monitor) {

        return false;

    }


    clearInterval(
        monitor.interval
    );


    monitors.delete(
        username
    );


    saveMonitors();


    console.log(
        `🛑 Backend monitoring stopped: @${username}`
    );


    return true;

}


// ======================================================
// START MONITOR API
// ======================================================

app.post(
    '/api/monitor/start',
    (req, res) => {

        let { username } =
            req.body;


        if (!username) {

            return res.status(400).json({

                success: false,

                error:
                    'Username required'

            });

        }


        username =
            username
                .trim()
                .toLowerCase()
                .replace('@', '');


        const started =
            startMonitor(
                username
            );


        res.json({

            success: true,

            monitoring: true,

            username,

            alreadyRunning:
                !started

        });

    }
);


// ======================================================
// STOP MONITOR API
// ======================================================

app.post(
    '/api/monitor/stop',
    (req, res) => {

        let { username } =
            req.body;


        if (!username) {

            return res.status(400).json({

                success: false,

                error:
                    'Username required'

            });

        }


        username =
            username
                .trim()
                .toLowerCase()
                .replace('@', '');


        stopMonitor(
            username
        );


        res.json({

            success: true,

            monitoring: false,

            username

        });

    }
);


// ======================================================
// MONITOR STATUS API
// ======================================================

app.get(
    '/api/monitor/status',
    (req, res) => {

        const result =
            [...monitors.entries()]
                .map(
                    ([username, monitor]) => ({

                        username,

                        monitoring:
                            true,

                        startedAt:
                            monitor.startedAt,

                        lastStatus:
                            monitor.lastStatus,

                        elapsedSeconds:
                            Math.floor(
                                (
                                    Date.now() -
                                    monitor.startedAt
                                ) / 1000
                            )

                    })
                );


        res.json({

            success: true,

            monitors:
                result

        });

    }
);


// ======================================================
// LOAD SAVED MONITORS
// ======================================================

function loadSavedMonitors() {

    try {

        if (
            !fs.existsSync(
                MONITOR_FILE
            )
        ) {

            console.log(
                '📁 No saved monitors found.'
            );

            return;

        }


        const saved =
            JSON.parse(
                fs.readFileSync(
                    MONITOR_FILE,
                    'utf8'
                )
            );


        if (
            !Array.isArray(saved)
        ) {

            return;

        }


        for (
            const item of saved
        ) {

            // Old format:
            // ["username"]

            if (
                typeof item ===
                'string'
            ) {

                startMonitor(
                    item,
                    true
                );

            }

            // New format:
            // [{ username, startedAt, lastStatus }]

            else if (
                item?.username
            ) {

                startMonitor(
                    item.username,
                    true,
                    item
                );

            }

        }


        console.log(
            `🔄 Restored ${monitors.size} monitor(s).`
        );


    } catch (e) {

        console.error(
            '❌ Failed to load saved monitors:',
            e.message
        );

    }

}


// ======================================================
// START SERVER
// ======================================================

app.listen(

    PORT,

    '0.0.0.0',

    () => {

        console.log(
            `🚀 Server running on http://localhost:${PORT}`
        );


        loadSavedMonitors();

    }

);
