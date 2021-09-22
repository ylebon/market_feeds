var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
var request = require('sync-request');

const KrakenClient = require('kraken-api');

class Book{
    // book constuctor
    constructor(){
        this.bbo = {};
        this.last = {};
    }

    // update book
    update(instrument, bids, asks){
        const best_bid = bids.sort(function(a,b) {
            return b[0] - a[0];
        })[0];


        // total bid qty
        var total_bid_qty = bids.reduce((a, b) => a[1] + b[1], 0);

        const best_ask =  asks.sort(function(a,b) {
            return a[0] - b[0];
        })[0];

        if (typeof best_ask != "undefined"){
            try{
                this.last[instrument]['ask_price'] = parseFloat(best_ask[0]);
                this.last[instrument]['ask_qty'] = parseFloat(best_ask[1]);
                this.last[instrument]['ask_timestamp'] = parseFloat(best_ask[2]);
            }catch(error){
                this.last[instrument] = {'ask_price':null, 'ask_qty':null, 'ask_timestamp':null};
                this.last[instrument]['ask_price'] = parseFloat(best_ask[0]);
                this.last[instrument]['ask_qty'] = parseFloat(best_ask[1]);
                this.last[instrument]['ask_timestamp'] = parseFloat(best_ask[2]);

            }
        }
        if (typeof best_bid != "undefined"){
            try{
                this.last[instrument]['bid_price'] = parseFloat(best_bid[0]);
                this.last[instrument]['bid_qty'] = parseFloat(best_bid[1]);
                this.last[instrument]['bid_timestamp'] = parseFloat(best_bid[2]);
            }catch(error){
                this.last[instrument] = {'bid_price':null, 'bid_qty':null, 'bid_timestamp':null};
                this.last[instrument]['bid_price'] = parseFloat(best_bid[0]);
                this.last[instrument]['bid_qty'] = parseFloat(best_bid[1]);                this.last[instrument]['bid_timestamp'] = parseFloat(best_bid[2]);

            }
        }

    }

    // get last price
    getLast(instrument){
        return this.last[instrument];
    }
}
class Krakenmarketfeed {

    // constructor
    constructor(settings, instruments, loglevel){
        this.settings = settings;
        this.instruments = instruments;
        this.book = new Book();
        this.sequences = {};
        this.mapping = {}
        this.logger = new (winston.Logger)({
          transports: [
            new (winston.transports.Console)(
            {
                colorize: true,
                timestamp: function() {
                    return new Date().toISOString();
                },
                level: loglevel
            })
          ]
        });
    }

    // start
    start(cb){
        let self = this;
        self.logger.info('Starting Kraken Market Data: %s', self.instruments);
        const kraken = new KrakenClient(self.settings.key, self.settings.secret);

        // exchanges codes
        self.logger.info('Collecting asset pairs reference data');
        var res = request('GET', 'https://api.kraken.com/0/public/AssetPairs');
        var assetsPairs = JSON.parse(res.getBody('utf8')).result;
        var instrument, value;
        Object.keys(assetsPairs).forEach(function(key) {
            value = assetsPairs[key];
            instrument = {symbol: value.altname, exchange_name:key, quote:value.quote, base:value.base};
            console.log(instrument);
        });

        // exchanges codes
        let exchanges_codes = self.settings.symbols

        // update sequences
        for (var i in self.instruments){
            self.sequences[self.instruments[i]] = 0;
        }

        let last;
        let symbol_exchange_send, symbol_exchange_receive;
        let tick;
        let asks = [];
        let bids = [];
        let timestamp;
        var depth;
        var interval = setInterval(function(str1, str2) {
            self.instruments.forEach(function(instrument){
                symbol_exchange_send = exchanges_codes.find(x => x.symbol == instrument).send
                kraken.api('Depth', { pair : symbol_exchange_send, count:10}, function(error, depth){
                    self.sequences[instrument] = self.sequences[instrument] + 1;
                    symbol_exchange_receive = exchanges_codes.find(x => x.symbol == instrument).receive;
                    if (depth){
                        depth = depth.result[symbol_exchange_receive];
                        self.book.update(instrument, depth.bids, depth.asks);
                        // get last tick
                        last = self.book.getLast(instrument);
                        // tick
                        tick = {
                            type: 'TICK',
                            tick: {
                                ask_price: last.ask_price,
                                ask_qty: last.ask_qty,
                                bid_price: last.bid_price,
                                bid_qty: last.bid_qty,
                                ask_levels: depth.asks.length,
                                bid_levels: depth.bids.length,
                                exchange_timestamp: last.bid_timestamp, // will add ask and bid
                                marketfeed_timestamp: Date.now() / 1000,
                                symbol: instrument,
                                status: 'crypto',
                                exchange_code: symbol_exchange_receive,
                                seq: self.sequences[instrument],
                                exchange: 'kraken'
                            }
                        }
                        cb(tick);
                    }
                })
            });
        }, 1000);

    }

     // set instruments
    setInstruments(instruments){
        self.logger.info('Setting Oanda price instruments subscription: %s', instruments);
        self.instruments = instruments;
    }

    // get instruments
    getInstruments(){
        self.logger.info('Get instruments');
        return self.instruments;
    }

    updateInstruments(instruments){
        stop();
        setInstruments(instruments);
        start(sendTick);
    }


}


// node.js module export
module.exports.Krakenmarketfeed = Krakenmarketfeed;
