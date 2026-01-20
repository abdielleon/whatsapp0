const fs = require('fs');
require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { getMessages, responseMessages, bothResponse } = require('./controllers/flows');

const express = require('express');
const cors = require('cors');

// Handlers
const { hasTestWord, generateImage, cleanNumber, checkEnvFile, createClient, isValidNumber } = require('./controllers/handle');
const { saveMedia } = require('./controllers/save');
const { sendMedia, sendMessage, lastTrigger, sendMessageButton, readChat } = require('./controllers/send');

// Require library with LocalAuth strtagey
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(cors());
app.use(express.json());

const server = require('http').Server(app);
const https = require('https');
const port = process.env.PORT || 3000;
const portHttps = process.env.PORTHTTPS || 4000;
// var client;
app.use('/', require('./routes/web'));
app.use(express.static(__dirname + '/static', { dotfiles: 'allow' }))

/**
 * Listen to incoming message
 */
 const listenToMessage = () => client.on('message', async message => {

    let messageBody = message.body.toLowerCase();
    const messageFrom = message.from;
    const messageHasMedia = message.hasMedia;

    if(!isValidNumber(message.from)){
        return
    }

    // Este bug lo reporto Lucas Aldeco Brescia para evitar que se publiquen estados
    if (message.from === 'status@broadcast') {
        return
    }

    if(messageBody === 'ping') {

        // Answer as a WhatsApp reply
                message.reply('pong');

        // Answer as a new message
        client.sendMessage(message.from, 'pong2');

        return;
        }

    console.log('BODY',messageBody)
    const number = cleanNumber(message.from);
    await readChat(number, messageBody);

    /**
     * Guardamos el archivo multimedia que envia
     *
     * 2022-09-27 Abdiel: Added conditional if(media){},
     *  to avoid this error: → TypeError: Cannot read properties of undefined (reading 'extensions')
     */
     if (process.env.SAVE_MEDIA && message.hasMedia) {
        const media = await message.downloadMedia();

        if (media) {
            saveMedia(media)
        }else{
            console.log("⚠ Error: No media saved in saveMedia() because message.hasMedia does not exist.");
        }
    }

    /**
     * Si estas usando dialogflow solo manejamos una funcion todo es IA
     */

     if (process.env.DATABASE === 'dialogflow') {
        if(!messageBody.length) return;

        // ----------------
        // If test mode
        // ----------------
        if (process.env.TEST_MODE == 'true') {

            // Test word
            const testWord = process.env.TEST_MODE_WORD;

            // If messageBody starts with test word
            if(!hasTestWord(messageBody)) {

                // client.sendMessage(message.from, `Gracias por escribirme. Si quieres probar el bot, inicia tus mensajes con la palabra "${testWord}". Ejemplo: "${testWord} Hola" `);

                return;
            }

            // Remove test word
            messageBody = messageBody.replace(testWord, '');

        }

        // Insert number before body text
        messageBody = number.replace('@c.us', '') + ' ' + messageBody;

        // Handle Large texts!
        if(messageBody.length > 256) {
            messageBody = messageBody.substring(0,255);
        };

        const response = await bothResponse(messageBody);

        const trigger = process.env.DIALOGFLOW_AGENT

        const abdielArgs = { sendSeen: false };
        await sendMessage(client, message.from, response.replyMessage, trigger, abdielArgs);
        if (response.media) {
            sendMedia(client, message.from, response.media);
        }
        return;
    }
});


/**
 * Start the action
 */
 const wwebVersion = '2.2412.54';

 const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
                '--no-sandbox',             // Essential for running as non-root on Linux/Docker
                '--disable-setuid-sandbox', // Related to the above
                '--disable-dev-shm-usage',  // Critical for limited environments (e.g., Docker/PM2)
                '--disable-accelerated-mhtml-generation', // Added for potential stability
                '--disable-gpu',            // Disables GPU hardware acceleration
            ],
    }, // Should be true, set to false only for debugging
    webVersionCache: {
        type: 'remote',
        remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${wwebVersion}.html`,
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('Client is ready!');

    // Start listening
    listenToMessage();
});

client.on('auth_failure', (e) => {
    console.log("🚀 🚀 🚀 ~ e", e);
    connectionLost();
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.initialize();

// -------------------------------------------------------------------------------------
// Start Abdiel API
// -------------------------------------------------------------------------------------

/**
 * Start Abdiel API
 */
app.get('/', (req, res) => {
    res.send('Hello you!')
  });
app.get('/api/chatbot/send-messages', (req, res) => {
    res.send('Hello');
    // res.send(req.query.hi);
});
app.post('/api/chatbot/send-messages', async (req, res) => {

    // Add validation here using 'passport' 
    // https://levelup.gitconnected.com/node-js-basics-add-authentication-to-an-express-app-with-passport-55a181105263

    // --------------------------------------------
    // Set request timeout
    // --------------------------------------------
    const contacts = req.body.contacts;
    const messages = req.body.messages;

    let contactsCount = 0; for(const contact of contacts){ contactsCount++; }
    const messagesCount = messages.length;
    const apiMessagesDelay = Number(process.env.API_MESSAGES_DELAY);

    const resDelay = contactsCount * messagesCount * apiMessagesDelay
    req.setTimeout(resDelay); // console.log("🚀 ~ resDelay:", resDelay);

    // --------------------------------------------
    const trigger = req.body.trigger;
    let responseText = 'No action.';
    // console.log('💡 💡 💡 req: '); //
    console.log('Entered api: ', new Date());
    console.log(req.body);

    if (trigger == 'te-io'){
        responseText = await sendApiMessage(req);
        res.send(responseText,);
        return;
    }
    res.send(responseText);
});
const sendApiMessage = async (req) => {
    const contacts = req.body.contacts;
    const trigger = req.body.trigger;
    const messages = req.body.messages;
    const from = req.body.from;
    const results = [];
    const justSentTo = [];
    let sendTwiceAvoidedCount = 0;

    const contactGroupSize = 5;
    const contactGroups = [];
    for (let i = 0; i < contacts.length; i += contactGroupSize) {
        contactGroups.push(contacts.slice(i, i + contactGroupSize));
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    console.log("🚀 ~ contactGroups:", contactGroups);
    
    for (const contactGroup of contactGroups) {
        try {
            for await ( const contact of contactGroup ) {
                // Wait before sending text/s to each contact
                // await randomDelayFunction(Number(process.env.API_MESSAGES_DELAY), 0.5);
    
                let {name, number, code}               = contact;
                let {lesson_time, day_name, time_zone} = contact;
                let {value_1, value_2, value_3}        = contact;
    
                // Messages sent full text
                let {message_text}            = contact;
                let {message_text_1}          = contact;
                let {message_text_2}          = contact;
                let {message_text_3}          = contact;
                let {message_text_4}          = contact;
                let {payment_collection_text} = contact;
    
                if ( justSentTo.includes(number)){
                    if (from != '5491133612411' && number != '5491133612411@c.us'){ // Do it only if not local
                        sendTwiceAvoidedCount++;
                        console.log('☺ from: ', from);
                        continue;
                    }
                }
                justSentTo.push(number);
                console.log('Already sent (justSentTo): '+justSentTo);
    
                for (const message of messages){
                    let text = message;

                    // ------------------------------------------
                    // (1) map the values
                    // Values to be replaced
                    const mapObj = {
                        "%NAME%" : name ?? '',
                        
                        "%CODE%" : code ?? '',
                        
                        "%LESSON_TIME%" : lesson_time ?? '',
                        "%DAY_NAME%"    : day_name    ?? '',
                        "%TIME_ZONE%"   : time_zone   ?? '',
    
                        "%VALUE_1%" : value_1 ?? '',
                        "%VALUE_2%" : value_2 ?? '',
                        "%VALUE_3%" : value_3 ?? '',
                        
                        "%PAYMENT_COLLECTION_TEXT%" : payment_collection_text ?? '',
                        "%MESSAGE_TEXT%"   : message_text ?? '',
                        "%MESSAGE_TEXT_1%" : message_text_1 ?? '',
                        "%MESSAGE_TEXT_2%" : message_text_2 ?? '',
                        "%MESSAGE_TEXT_3%" : message_text_3 ?? '',
                        "%MESSAGE_TEXT_4%" : message_text_4 ?? '',
                    };
                    // ------------------------------------------
                    // (2) Create the regex
                    const regex = /%NAME%|%CODE%|%LESSON_TIME%|%DAY_NAME%|%TIME_ZONE%|%VALUE_1%|%VALUE_2%|%VALUE_3%|%PAYMENT_COLLECTION_TEXT%|%MESSAGE_TEXT%|%MESSAGE_TEXT_1%|%MESSAGE_TEXT_2%|%MESSAGE_TEXT_3%|%MESSAGE_TEXT_4%/gi;
                    // ------------------------------------------
                    // (3) Replace values
                    text = text.replace(regex, matched => mapObj[matched]);

                    // 🚨 DEBUG
                    console.log(`Attempting to send message to ${number}: "${text.substring(0, 30)}..."`);

                    // ------------------------------------------
                    // Send message
                    try{
                        console.log('Will send message', new Date());
                        const messageResult = await sendMessage (client, number, text, trigger);
    
                        // Log successful send (messageResult usually contains the ID or status)
                        console.log(`✅ Message sent successfully to ${number}. Status: ${messageResult.id.id}`);
                    } catch(err){
                        // 🚨 DEBUG
                        console.error(`❌ FAILED to send message to ${number}:`, err.message || err);
                    }

                    // Wait after every text in sent
                    await randomDelayFunction(Number(process.env.API_MESSAGES_DELAY), 0.5);
                }
                results.push(contact);
            }
        } catch (err) {

            console.error(`❌ Error: ${number}:`, err);
            results.push({err}); // return err;
        }
    };


    // try {
    //     for await ( const contact of contacts ) {
    //         // Wait before sending text/s to each contact
    //         // await randomDelayFunction(Number(process.env.API_MESSAGES_DELAY), 0.5);

    //         let {name, number, code}               = contact;
    //         let {lesson_time, day_name, time_zone} = contact;
    //         let {value_1, value_2, value_3}        = contact;

    //         // Messages sent full text
    //         let {message_text}            = contact;
    //         let {message_text_1}          = contact;
    //         let {message_text_2}          = contact;
    //         let {message_text_3}          = contact;
    //         let {message_text_4}          = contact;
    //         let {payment_collection_text} = contact;

    //         if ( justSentTo.includes(number)){
    //             if (from != '5491133612411@c.us'){ // Do it only if not local
    //                 sendTwiceAvoidedCount++;
    //                 console.log('☺ from: ', from);
    //                 continue;
    //             }
    //         }
    //         justSentTo.push(number);
    //         console.log('Already sent (justSentTo): '+justSentTo);

    //         for (const message of messages){
    //             let text = message;
    //             // ------------------------------------------
    //             // (1) map the values
    //             // Values to be replaced
    //             const mapObj = {
    //                 "%NAME%" : name ?? '',
                    
    //                 "%CODE%" : code ?? '',
                    
    //                 "%LESSON_TIME%" : lesson_time ?? '',
    //                 "%DAY_NAME%"    : day_name    ?? '',
    //                 "%TIME_ZONE%"   : time_zone   ?? '',

    //                 "%VALUE_1%" : value_1 ?? '',
    //                 "%VALUE_2%" : value_2 ?? '',
    //                 "%VALUE_3%" : value_3 ?? '',
                    
    //                 "%PAYMENT_COLLECTION_TEXT%" : payment_collection_text ?? '',
    //                 "%MESSAGE_TEXT%"   : message_text ?? '',
    //                 "%MESSAGE_TEXT_1%" : message_text_1 ?? '',
    //                 "%MESSAGE_TEXT_2%" : message_text_2 ?? '',
    //                 "%MESSAGE_TEXT_3%" : message_text_3 ?? '',
    //                 "%MESSAGE_TEXT_4%" : message_text_4 ?? '',
    //             };
    //             // ------------------------------------------
    //             // (2) Create the regex
    //             const regex = /%NAME%|%CODE%|%LESSON_TIME%|%DAY_NAME%|%TIME_ZONE%|%VALUE_1%|%VALUE_2%|%VALUE_3%|%PAYMENT_COLLECTION_TEXT%|%MESSAGE_TEXT%|%MESSAGE_TEXT_1%|%MESSAGE_TEXT_2%|%MESSAGE_TEXT_3%|%MESSAGE_TEXT_4%/gi;
    //             // ------------------------------------------
    //             // (3) Replace values
    //             text = text.replace(regex, matched => mapObj[matched]);
    //             // ------------------------------------------
    //             // Send message
    //             console.log('Will send message', new Date());
    //             await sendMessage (client, number, text, trigger);
    //             // Wait after every text in sent
    //             await randomDelayFunction(Number(process.env.API_MESSAGES_DELAY), 0.5);
    //         }
    //         results.push(contact);
    //     }
    // } catch (err) {
    //     results.push({err}); // return err;
    // }
    return {results,message: "Messages processed, check WhatsApp to confirm delivery.",sendTwiceAvoidedCount,justSentTo};
}
/**
 *
 * @param {Int} milliseconds    time to wait
 * @returns Promise
 */
 const delayFunction = (milliseconds) => {
    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
 }
/**
 *
 * @param {Int} milliseconds  approximate time to wait
 * @param {Float} timeFloat   0 to 1. Variation of that time both over and under, has to be less than the other param
 * @returns Promise
 */
 const randomDelayFunction = async (milliseconds, timeFloat = null) => {
    let range = Number(milliseconds * timeFloat);
    // Random time witihin a margin of ms over and ms under the declared milliseconds
    const randomTime = Math.floor(Math.random() * (Number(milliseconds) + range + 1));
    return await delayFunction(randomTime);
 }
/* End Abdiel API */

// -------------------------------------------------------------------------------------
// End Abdiel API
// -------------------------------------------------------------------------------------


server.listen(port, () => {
    console.log(`El server esta listo por el puerto ${port}`);
});

if (process.env.ENVIRONMENT == 'production' ){
    https.createServer({
        key: fs.readFileSync(process.env.HTTPS_KEY),
        cert: fs.readFileSync(process.env.HTTPS_CERT),
    }, app)
    .listen(process.env.PORTHTTPS, () => {
        console.log('Listening securely...')
    });
}

checkEnvFile();

// Saved in Aug.2023
// Abdiel
// module.exports = {app};