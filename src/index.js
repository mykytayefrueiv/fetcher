var fs = require('fs');
var cheerio = require('cheerio');
var _ = require('lodash');
var repeat = require('repeat');
var telegramBot = require('node-telegram-bot-api');
var DateTime = require('luxon').DateTime;
var schedule = require('node-schedule');

const token = '363253029:AAFkEBgoD6-8c2SCu6PYBjXjrwShX1x5-1c';
var bot = new telegramBot(token, {polling: true});
var olx = 'https://www.njuskalo.hr/iznajmljivanje-stanova/donji-grad?price%5Bmin%5D=600&price%5Bmax%5D=1000&numberOfRooms%5Bmin%5D=three-rooms&numberOfRooms%5Bmax%5D=three-rooms';
const puppeteer = require('puppeteer');

var processBegin = false;
var roomIdsToSend = [];
var job;

bot.onText(/\/immediately/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!_.some(roomIdsToSend, chatId)) {
        roomIdsToSend.push(chatId);
    }
    if (processBegin) {
        bot.sendMessage(chatId, "I'm working, i'll tell you the news");
    } else {
        processBegin = true;
        bot.sendMessage(chatId, "Okey, lets go, ill tell you the news");

        fetching();
        job = schedule.scheduleJob('* 17 * * *', fetching);
        console.log(job.nextInvocation());
        sendMessageToAllSubscribers("Next time i will come at " + job.nextInvocation());
    }
});

bot.onText(/\/start/, (msg, match) => {
    const chatId = msg.chat.id;
    if (!_.some(roomIdsToSend, chatId)) {
        roomIdsToSend.push(chatId);
    }
    if (processBegin) {
        bot.sendMessage(chatId, "I'm working, i'll tell you the news");
    } else {
        processBegin = true;
        bot.sendMessage(chatId, "Okey, lets go, ill tell you the news");

        job = schedule.scheduleJob('* 17 * * *', fetching);
        console.log(job.nextInvocation());
        sendMessageToAllSubscribers("Next time i will come at " + job.nextInvocation());
    }
});

bot.on("polling_error", console.log);

bot.onText(/\/stop/, (msg, match) => {
    console.log('stopped');
    sendMessageToAllSubscribers('Process is ended manually');
    processBegin = false;
});

function sendMessageToAllSubscribers(msg) {
    _.each(roomIdsToSend, (chatId) => {
        bot.sendMessage(chatId, msg);
    });
}
async function fetching() {
    console.log('start fetch');
    const browser = await puppeteer.launch({ headless: true });


    console.log('open browser');
    const page = await browser.newPage();

    // Set user agent and other headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
    });

    // Navigate to page
    await page.goto(olx, { waitUntil: 'load' });
    console.log('page loaded');

    // Interact with the page (optional)
    const content = await page.content();

    console.log('content loaded');

    let $ = cheerio.load(content);
    let offers = $('.EntityList--Regular > ul > li');
    const offertas=  _.filter(offers.map((o, el) => {
        return {
            name: $(el)
                .find('.entity-title')
                .text(),
            description: $(el)
                .find('.entity-description')
                .text(),
            link: `https://www.njuskalo.hr${$(el)
                .find('.entity-title > a')
                .attr('href')}`,
            price: $(el)
                .find('.entity-prices')
                .text()
                .replace(/\s{2,}/g, ''),
            date: extractDate(
                $(el)
                    .find('.entity-pub-date')
                    .text()
                    .replace(/\s{2,}/g, '')
                )
        };
    }), ({ name }) => name !== '');

    console.log(offertas, 'offertas');

    await browser.close();

    let filteredByDate = _.filter(offertas, (o) => {
         return DateTime.fromFormat(extractDate(o.date), 'dd.MM.yy').diffNow('days').negate().days < 1;
    });

    if (fs.existsSync('./db.json')) {
        let database = JSON.parse(fs.readFileSync('./db.json').toString());
        let newOffertas = _.differenceWith(filteredByDate, database, (oldObj, newObj) => {
            return oldObj.link === newObj.link;
        });
        if (!newOffertas.length) {
            sendMessageToAllSubscribers('Things aint changed');
            console.log('Things aint changed');
        } else {
            sendMessageToAllSubscribers('Take new houses');
            _.each(newOffertas, (o, i) => {
                sendMessageToAllSubscribers(`${i + 1}. ${o.name}\n${o.price}\n${o.link}\n${o.date}`);
            });
            console.log('Found ' + newOffertas.length);
        }
        fs.writeFileSync('./new.json', JSON.stringify(newOffertas), 'utf-8');
        fs.appendFile('log', `Found ${newOffertas.length} new houses at ${Date.now().toLocaleString()}\n`, () => {});
    }
    fs.writeFileSync('./db.json', JSON.stringify(filteredByDate), 'utf-8');

    console.log(job.nextInvocation());
    sendMessageToAllSubscribers("Next time i will come at " + job.nextInvocation());
}

function extractDate(inputString) {
    // Use a regular expression to match the date pattern (dd.mm.yyyy) without the trailing dot
    const datePattern = /\d{2}\.\d{2}\.\d{4}/;

    // Extract the date using the regex
    const match = inputString.match(datePattern);

    if (match) {
        return match[0]; // Return the matched date
    } else {
        return null; // Return null if no date is found
    }
}