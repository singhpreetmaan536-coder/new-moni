const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 5000;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// ======================================================
// BACKEND MONITOR PERSISTENCE
// ======================================================

// Saved monitors file
const MONITOR_FILE = path.join(__dirname, 'monitors.json');

// Active backend monitors
const backendMonitors = new Map();


// ------------------------------------------------------
// Load saved monitors when server starts
// ------------------------------------------------------
function loadSavedMonitors() {
    try {
        if (!fs.existsSync(MONITOR_FILE)) {
            console.log('📁 No saved monitors found.');
            return;
        }

        const saved = JSON.parse(
            fs.readFileSync(MONITOR_FILE, 'utf8')
        );

        if (!Array.isArray(saved)) return;

        saved.forEach(username => {
            if (typeof username === 'string' && username.trim()) {
                startBackendMonitor(
                    username.trim()
                        .toLowerCase()
                        .replace('@', ''),
                    false
                );
            }
        });

        console.log(`🔄 Loaded ${saved.length} saved monitor(s).`);

    } catch (e) {
        console.error(
            '❌ Failed to load saved monitors:',
            e.message
        );
    }
}


// ------------------------------------------------------
// Save currently active monitors
// ------------------------------------------------------
function saveMonitors() {
    try {
        fs.writeFileSync(
            MONITOR_FILE,
            JSON.stringify(
                [...backendMonitors.keys()],
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


// ------------------------------------------------------
// Start backend monitor
// ------------------------------------------------------
function startBackendMonitor(username, save = true) {

    username = username
        .trim()
        .toLowerCase()
        .replace('@', '');

    if (!username) return false;

    // Already monitoring
    if (backendMonitors.has(username)) {
        return false;
    }


    // --------------------------------------------------
    // Check every 3 seconds
    // --------------------------------------------------
    const interval = setInterval(async () => {

        try {

            const result = await axios.post(
                `http://127.0.0.1:${PORT}/api/check`,
                {
                    username
                },
                {
                    timeout: 15000
                }
            );

            const data = result.data;

            console.log(
                `[MONITOR] @${username} -> ${
                    data.exists ? 'ACTIVE' : 'BANNED'
                }`
            );

        } catch (e) {

            console.log(
                `[MONITOR] @${username} -> API ERROR`
            );

        }

    }, 3000);


    // Store monitor
    backendMonitors.set(
        username,
        interval
    );


    // Save monitor to disk
    if (save) {
        saveMonitors();
    }


    // --------------------------------------------------
    // Immediate first check
    // --------------------------------------------------
    axios.post(
        `http://127.0.0.1:${PORT}/api/check`,
        {
            username
        },
        {
            timeout: 15000
        }
    )
    .then(result => {

        console.log(
            `[MONITOR] @${username} -> ${
                result.data.exists
                    ? 'ACTIVE'
                    : 'BANNED'
            }`
        );

    })
    .catch(() => {

        console.log(
            `[MONITOR] @${username} -> API ERROR`
        );

    });


    console.log(
        `👁️ Backend monitoring started: @${username}`
    );

    return true;
}


// ------------------------------------------------------
// Stop backend monitor
// ------------------------------------------------------
function stopBackendMonitor(username) {

    username = username
        .trim()
        .toLowerCase()
        .replace('@', '');

    const interval =
        backendMonitors.get(username);

    if (!interval) {
        return false;
    }


    clearInterval(interval);

    backendMonitors.delete(username);

    saveMonitors();


    console.log(
        `🛑 Backend monitoring stopped: @${username}`
    );

    return true;
}


// ======================================================
// MONITOR API
// ======================================================


// ------------------------------------------------------
// START MONITOR
// ------------------------------------------------------
app.post('/api/monitor/start', (req, res) => {

    let { username } = req.body;

    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'Username required'
        });
    }


    username = username
        .trim()
        .toLowerCase()
        .replace('@', '');


    startBackendMonitor(
        username,
        true
    );


    res.json({
        success: true,
        monitoring: true,
        username
    });

});


// ------------------------------------------------------
// STOP MONITOR
// ------------------------------------------------------
app.post('/api/monitor/stop', (req, res) => {

    let { username } = req.body;

    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'Username required'
        });
    }


    username = username
        .trim()
        .toLowerCase()
        .replace('@', '');


    stopBackendMonitor(username);


    res.json({
        success: true,
        monitoring: false,
        username
    });

});


// ------------------------------------------------------
// MONITOR STATUS
// ------------------------------------------------------
app.get('/api/monitor/status', (req, res) => {

    const username =
        (req.query.username || '')
            .trim()
            .toLowerCase()
            .replace('@', '');


    res.json({

        monitoring:
            username
                ? backendMonitors.has(username)
                : false,

        username,

        monitors:
            [...backendMonitors.keys()]

    });

});


// ======================================================
// MAIN PAGE
// ======================================================

app.get('/', (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            'public',
            'index.html'
        )
    );

});


// ======================================================
// HTML ENTITY DECODER
// ======================================================

function decodeHTMLEntities(text) {

    if (!text) return "";

    return text

        .replace(
            /&#x([0-9a-fA-F]+);/g,
            (_, hex) =>
                String.fromCodePoint(
                    parseInt(hex, 16)
                )
        )

        .replace(
            /&#(\d+);/g,
            (_, num) =>
                String.fromCodePoint(
                    num
                )
        )

        .replace(
            /&amp;/g,
            '&'
        )

        .replace(
            /&lt;/g,
            '<'
        )

        .replace(
            /&gt;/g,
            '>'
        )

        .replace(
            /&quot;/g,
            '"'
        );
}


// ======================================================
// EXISTING INSTAGRAM CHECK API
// ======================================================

app.post('/api/check', async (req, res) => {

    let { username } = req.body;


    if (!username) {

        return res.json({
            exists: false,
            status: "BANNED"
        });

    }


    username = username
        .trim()
        .toLowerCase()
        .replace('@', '');


    // ==================================================
    // METHOD 1
    // ==================================================

    try {

        const headers = {

            "x-ig-app-id":
                "936619743392459",

            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",

            "Accept":
                "*/*",

            "Referer":
                "https://www.instagram.com/"

        };


        const response = await axios.get(

            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,

            {
                headers,

                timeout: 12000,

                validateStatus:
                    () => true
            }

        );


        if (
            response.status === 200 &&
            response.data?.data?.user
        ) {

            const user =
                response.data.data.user;


            return res.json({

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

            });

        }

    } catch (e) {

        // Continue to Method 2

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
            // Name
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
            // Description
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
            // Profile picture
            // ------------------------------------------

            const picMatch =
                html.match(
                    /property="og:image" content="([^"]+)"/i
                );


            if (picMatch) {

                profilePic =
                    picMatch[1];

            }


            return res.json({

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

            });

        }

    } catch (e) {

        // Return banned below

    }


    // ==================================================
    // NOT FOUND / BANNED
    // ==================================================

    return res.json({

        exists: false,

        status: "BANNED"

    });

});


// ======================================================
// LOAD SAVED MONITORS
// ======================================================

// This runs when the Node.js server starts.
// Saved monitors will continue automatically.

loadSavedMonitors();


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

    }
);