var needle = require('needle');
var fs = require('fs');
var cheerio = require('cheerio');
var _ = require('lodash');
var repeat = require('repeat');
var telegramBot = require('node-telegram-bot-api');
const token = '363253029:AAFkEBgoD6-8c2SCu6PYBjXjrwShX1x5-1c';
var bot = new telegramBot(token, {polling: true});
var olx = 'https://www.olx.ua/nedvizhimost/arenda-kvartir/dolgosrochnaya-arenda-kvartir/dne' +
        'pr/?search%5Bfilter_float_price%3Afrom%5D=5000&search%5Bfilter_float_price%3Ato%' +
        '5D=6000&search%5Bfilter_float_number_of_rooms%3Afrom%5D=1&search%5Bfilter_float_' +
        'number_of_rooms%3Ato%5D=2';

var processBegin = false;
var roomIdsToSend = [];
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

        repeat(fetching)
            .every(30 + Math.random() * (20 - (- 10)) + (- 10), 'm')
            .for (2, 'h')
            .while(() => { return processBegin })
            .start.now().then(() => {
                processBegin = false;
                _.each(roomIdsToSend, (chatId) => {
                    bot.sendMessage(chatId, 'Process is ended');
                });
                console.log('ended, hurray');
            });
        }
});

bot.onText(/\/stop/, (msg, match) => {
    sendMessageToAllSubscribers('Process is ended manually');
    processBegin = false;
});

function sendMessageToAllSubscribers(msg) {
    _.each(roomIdsToSend, (chatId) => {
        bot.sendMessage(chatId, msg);
    });
}

function fetching() {
    console.log('start fetch');
    needle.get(olx, (err, res) => {
        if (err) {
            console.error(err);
            return 0;
        }
        console.log('request sucess');
        let $ = cheerio.load(res.body);
        let offers = $('.offer');
        var offertas = offers.map((o, el) => {
            return {
                name: $(el)
                    .find('h3.x-large')
                    .text()
                    .replace(/\s{2,}/g, ''),
                link: $(el)
                    .find('h3.x-large > a')
                    .attr('href'),
                price: $(el)
                    .find('.price')
                    .text()
                    .replace(/\s{2,}/g, ''),
                date: $(el)
                    .find('p.x-normal')
                    .text()
                    .replace(/\s{2,}/g, '')
            };
        });
        let filteredByDate = _.filter(offertas, (o) => {
            return /сегодня/i.test(o.date);
        });
        if (fs.existsSync('./db.json')) {
            let database = JSON.parse(fs.readFileSync('./db.json'));
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
                console.log('Founded ' + newOffertas.length);
            }
            fs.writeFileSync('./new.json', JSON.stringify(newOffertas), 'utf-8');
            fs.appendFile('log', `Founded ${newOffertas.length} new houses at ${Date.now().toLocaleString()}\n`);
        }
        fs.writeFile('./db.json', JSON.stringify(filteredByDate), 'utf-8');
    });
}