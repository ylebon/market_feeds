var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
const cobinhood = require('node-cobinhood-api');



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
class Cobinhoodmarketfeed {

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
        self.logger.info('Starting Cobinhood Market Data: %s', self.instruments);


        // update instruments format
        var instruments = self.instruments.map(function(instrument) {
          var instrument_new = instrument.replace("_", "-");
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

        let channels = instruments.map(function(x){
            return {
                "type": 'order-book',
                "trading_pair_id": x
            }
        })

        cobinhood.websocket(channels, (error, message) => {
            var symbol;
            var timestamp;
            if (!error && message.update) {
                symbol= message.channel_id.split('.')[1];
                self.book.update(symbol, message.update.bids, message.update.asks);
                last = self.book.getLast(symbol);
                self.sequences[symbol] = self.sequences[symbol] + 1;
                timestamp = Date.now() / 1000;
                tick = {type: 'TICK',
                    tick:{
                        ask: last.ask_price,
                        ask_qty: last.ask_qty,
                        time: timestamp,
                        marketfeed_timestamp: timestamp,
                        timestamp: timestamp,
                        bid: last.bid_price,
                        bid_qty: last.bid_qty,
                        symbol: self.mapping[symbol],
                        status: 'crypto',
                        exchange_code: symbol,
                        seq: self.sequences[symbol],
                        exchange: 'cobinhood'
                    }
                }
                cb(tick);
            }
        }, true);

//        binance.websockets.depth(instruments, depth => {
//            let {e:eventType, E:eventTime, s:symbol, u:updateId, b:bidDepth, a:askDepth} = depth;
//            if (eventType == "depthUpdate"){
//                // update book
//                self.book.update(symbol, askDepth, bidDepth);
//                // get last tick
//                last = self.book.getLast(symbol);
//                // updates sequences
//                self.sequences[symbol] = self.sequences[symbol] + 1;
//                // tick
//
//                tick = {type: 'TICK',
//                    tick:{
//                        ask: last.ask_price,
//                        ask_qty: last.ask_qty,
//                        time: eventTime,
//                        marketfeed_timestamp: Date.now() / 1000,
//                        timestamp: eventTime/1000,
//                        bid: last.bid_price,
//                        bid_qty: last.bid_qty,
//                        symbol: self.mapping[symbol],
//                        status: 'crypto',
//                        exchange_code: symbol,
//                        seq: self.sequences[symbol],
//                        exchange: 'binance'
//                    }
//                }
//                cb(tick);
//            } else {
//                self.logger.error("Unknown type: ", depth.evenType);
//            }
//
//        })


    }

     // set instruments
    setInstruments(instruments){
        self.logger.info('Setting Cobinhood price instruments subscription: %s', instruments);
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
module.exports.Cobinhoodmarketfeed = Cobinhoodmarketfeed;


