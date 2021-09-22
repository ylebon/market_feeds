"use strict";

var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
var Book = require('../../lib/book').Book;


class Oandamarketfeed {

    // constructor
    constructor(settings, instruments, loglevel){
        this.settings = settings;
        this.instruments = instruments;
        this.book = new Book();
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
        self.logger.info('Starting Oanda price v2 with prices: %s', self.instruments);

        // Set sequences number
        var sequences = {};
        for (var i in self.instruments){
            sequences[self.instruments[i]] = 0;
        }

        // Create context
        var OandaContext = require('@oanda/v20/context').Context;
        let ctx = new OandaContext(
            self.settings.stream_url,
            443,
            true,
            "oanda sample javascript"
        );
        ctx.setToken(self.settings.access_token);

        // Create request options
        let instruments = self.instruments.join('%2C');
        let tick;
        let symbol;
        let last;
        let bids_depth;
        let asks_depth;
        let exchange_timestamp;

        ctx.pricing.stream(
            "001-004-1085421-001",
            {
                instruments: instruments,
                snapshot: true,
            },
            (message) => {
                if (message.type == "HEARTBEAT")
                {
                    self.logger.info(message.summary());
                    return;
                }
                else if (message.type == 'PRICE'){
                    symbol = message.instrument;
                    asks_depth = message.asks.map(function(x){
                        return [x.price, x.liquidity]
                    })

                    bids_depth = message.bids.map(function(x){
                        return [x.price, x.liquidity]
                    })

                    // update book
                    self.book.update(symbol, bids_depth, asks_depth);
                    // get last tick
                    last = self.book.getLast(symbol);
                    // updates sequences
                    sequences[symbol] = sequences[symbol] + 1;
                    // tick
                    exchange_timestamp = (new Date(message.time)).getTime() / 1000;

                    tick = {type: 'TICK',
                        tick:{
                            ask_price: last.ask_price,
                            ask_qty: last.ask_qty,
                            ask_levels: asks_depth.length,
                            bid_levels: bids_depth.length,
                            exchange_timestamp: exchange_timestamp,
                            marketfeed_timestamp: Date.now() / 1000,
                            bid_price: last.bid_price,
                            bid_qty: last.bid_qty,
                            symbol: symbol,
                            status: message.status,
                            exchange_code: symbol,
                            seq: sequences[symbol],
                            exchange: 'oanda'
                        }
                    }
                    cb(tick);
                }
            },
            (response) => {
                console.log(response);
            }
        );

        // convert to milliseconds
        function convertToMs(ts_sec) {
            var res = ts_sec.toString().split('.');
            const ms = (parseInt(res[0])*1000)+parseInt(res[1]);
            return ms;
        }

        // price to string
        function priceToString(price)
        {
            return (
                price.instrument + " "
                + price.time + " " +
                price.bids[0].price + "/" +
                price.asks[0].price
            );
        }


    }

    // stop
    stop(){
        self.logger.warn('Aborting streaming request ...');
        self.request.abort();
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
module.exports.Oandamarketfeed = Oandamarketfeed;










function priceToString(price)
{
    return (
        price.instrument + " "
        + price.time + " " +
        price.bids[0].price + "/" +
        price.asks[0].price
    );
}

