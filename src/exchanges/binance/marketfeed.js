var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
const binance = require('node-binance-api');



class Book{
    // book constuctor
    constructor(){
        this.bbo = {};
        this.last = {};
    }

    // update book
    update(instrument, bids, asks){
        // highest bid
        const sorted_bids = bids.sort(function(a, b){return parseFloat(a[0])-parseFloat(b[0])});
        const best_bid = sorted_bids[sorted_bids.length - 1];
        // lowest ask
        const sorted_asks = asks.sort(function(a, b){return parseFloat(a[0])-parseFloat(b[0])});
        const best_ask = sorted_asks[0];

       if (typeof best_ask != "undefined"){
            try{
                this.last[instrument]['ask_price'] = parseFloat(best_ask[0]);
                this.last[instrument]['ask_qty'] = parseFloat(best_ask[1]);
            }catch(error){
                this.last[instrument] = {'ask_price':null, 'ask_qty':null};
                this.last[instrument]['ask_price'] = parseFloat(best_ask[0]);
                this.last[instrument]['ask_qty'] = parseFloat(best_ask[1]);
            }
        }
        if (typeof best_bid != "undefined"){
            try{
                this.last[instrument]['bid_price'] = parseFloat(best_bid[0]);
                this.last[instrument]['bid_qty'] = parseFloat(best_bid[1]);
            }catch(error){
                this.last[instrument] = {'bid_price':null, 'bid_qty':null};
                this.last[instrument]['bid_price'] = parseFloat(best_bid[0]);
                this.last[instrument]['bid_qty'] = parseFloat(best_bid[1]);
            }
        }
    }

    // get last price
    getLast(instrument){
        return this.last[instrument];
    }
}
class Binancemarketfeed {

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
        self.logger.info('Starting Binance Market Data: %s', self.instruments);

        // binance options
        // Authenticated client, can make signed calls
        binance.options({
            APIKEY: process.env.API_KEY || self.settings.key,
            APISECRET: process.env.API_SECRET ||self.settings.secret,
            useServerTime: true,
            reconnect: true
        });

        // update instruments format
        var instruments = self.instruments.map(function(instrument) {
          var instrument_new = instrument.replace("_", "");
          self.mapping[instrument_new] = instrument;
          return instrument_new;
        });
        self.logger.debug("Instruments format send to exchange:", instruments);

        // update sequences
        for (var i in instruments){
            self.sequences[instruments[i]] = 0;
        }

        let last;
        let instrument;
        let tick;
        let asks = [];
        let bids = [];

        binance.websockets.depth(instruments, depth => {
            if (depth.e == "depthUpdate"){
                // update book
                self.book.update(depth.s, depth.b, depth.a);
                // get last tick
                last = self.book.getLast(depth.s);
                // updates sequences
                self.sequences[depth.s] = self.sequences[depth.s] + 1;
                // tick
                tick = {type: 'TICK',
                    tick:{
                        ask_price: last.ask_price,
                        ask_qty: last.ask_qty,
                        ask_levels: depth.a.length,
                        bid_levels: depth.b.length,
                        exchange_timestamp: depth.E/1000,
                        marketfeed_timestamp: Date.now() / 1000,
                        bid_price: last.bid_price,
                        bid_qty: last.bid_qty,
                        symbol: self.mapping[depth.s],
                        status: 'crypto',
                        exchange_code: depth.s,
                        seq: self.sequences[depth.s],
                        exchange: 'binance'
                    }
                }
                cb(tick);
            } else {
                self.logger.error("Unknown type: ", depth.evenType);
            }

        })

        // Trade WebSockets
        binance.websockets.trades(instruments, (trades) => {
            let {e:eventType, E:eventTime, s:symbol, p:price, q:quantity, m:maker, a:tradeId} = trades;
            const resp = {
                type: 'TRADE',
                trade:{
                    time: eventTime,
                    timestamp: eventTime/1000,
                    price: price,
                    maker: maker,
                    qty: quantity,
                    symbol: self.mapping[symbol],
                    exchange_code: symbol,
                    exchange: 'binance'
                }
            }
            cb(resp);
        });

    }

     // set instruments
    setInstruments(instruments){
        self.logger.info('Setting BINANCE price instruments subscription: %s', instruments);
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
module.exports.Binancemarketfeed = Binancemarketfeed;
