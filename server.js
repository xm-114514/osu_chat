
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const env = process.env;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function sanitizeInput(content) {
    return content
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}
function getMessages(channel) {
    const token = env.OSU_TOKEN;
    const session = env.OSU_SESSION;
    const cf_c = env.CF_CLEARANCE;
    const url = `https://osu.ppy.sh/community/chat/channels/${channel}/messages?return_object=1`;

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': `cf_clearance=${cf_c}; XSRF-TOKEN=${token}; osu_session=${session}`,
        'x-csrf-token': token,
        'x-requested-with': 'XMLHttpRequest'
      };
    return axios.get(url, {
        headers: headers,
        referrer: `https://osu.ppy.sh/community/chat?channel_id=${channel}`,
        referrerPolicy: 'strict-origin-when-cross-origin',
        mode: 'cors',
        withCredentials: true
    })
    .then(response => {
        if (response.status === 200) {
            const originalData = response.data;
            function getUserById(userId, users) {
                return users.find(u => u.id === userId);
            }
            const newStructure = originalData.messages.map(message => {
                const user = getUserById(message.sender_id, originalData.users);
                return {
                    uid: message.sender_id,
                    name: user ? user.username : "Unknown",
                    avatar_url: user ? user.avatar_url : "default-avatar.png",
                    timestamp: new Date(message.timestamp).toLocaleTimeString(),
                    content: sanitizeInput(message.content),
                };
            });
            return newStructure;
        } else if (response.status === 502) {
            console.error("Error 502: Bad Gateway. Stopping the process.");
            process.exit();
        } else {
            console.log("Received status:", response.status);
            return [];
        }
    })
    .catch(error => {
        console.error("An error occurred:", error.message);
        if (error.response && error.response.status === 502) {
            console.error("Error 502: Bad Gateway. Stopping the process.");
            process.exit();
        }
        return [];
    });
}

async function sendMessage(message, channel) {
    const token = env.OSU_TOKEN;
    const session = env.OSU_SESSION;
    const cf_c = env.CF_CLEARANCE;
    const url = `https://osu.ppy.sh/community/chat/channels/${channel}/messages`;
    const message_uuid = uuidv4();
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': `cf_clearance=${cf_c}; XSRF-TOKEN=${token}; osu_session=${session}`,
        'x-csrf-token': token,
        'x-requested-with': 'XMLHttpRequest'
    };
    const payload = new URLSearchParams({
        is_action: 'false',
        message: message,
        target_id: channel,
        target_type: 'channel',
        uuid: message_uuid
    });
    try {
        const response = await axios.post(url, payload, { headers: headers });
        if (response.status === 200) {
            console.log(`Message: '${message}'(${channel}) sent successfully.`);
            return [true, { channel: channel, message: message }];
        } else {
            return [false, { channel: channel, message: response.status }];
        }
    } catch (error) {
        console.error('Error sending message:', error.message);
        return [false, { channel: channel, message: error.message }];
    }
}

let channel = env.cid2;

app.get('/', async (req, res) => {
    const messages = await getMessages(channel);
    res.render('index', { messages: messages });
});

app.post('/send', async (req, res) => {
    const message = req.body.message;
    const result = await sendMessage(message, channel);
    if (result[0]) {
        res.status(200).send('Message sent successfully');
    } else {
        res.status(500).send('Failed to send message');
    }
});

app.post('/change', (req, res) => {
    const newChannel = req.body.channel;
    if (newChannel) {
        channel = newChannel;
        res.status(200).send(`Channel changed to ${newChannel}`);
    } else {
        res.status(400).send('Invalid channel ID');
    }
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
