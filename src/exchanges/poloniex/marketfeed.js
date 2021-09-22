var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
const Poloniex = require('poloniex-api-node');


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
class Poloniexmarketfeed {

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
        self.logger.info('Starting Poloniex Market Data: %s', self.instruments);

        let poloniex = new Poloniex();

        // update sequences
        for (var i in self.instruments){
            self.sequences[self.instruments[i]] = 0;
        }

        let last;
        let instrument;
        let tick;
        let last_ask_price = {};
        let last_bid_price = {};
        let last_ask_qty = {};
        let last_bid_qty = {};


        // subscribe to instrument
        for (let i in self.instruments){
             let exchange_code = self.instruments[i].split('_').reverse().join('_');
             poloniex.subscribe(exchange_code);
             self.mapping[exchange_code] = self.instruments[i];
        }

        poloniex.on('message', (channelName, data, seq) => {
            data.forEach(function(message){
                if (message.type == 'orderBookModify'){
                      self.logger.debug(`order book and trade updates received for currency pair ${channelName}`);
                      self.logger.debug(JSON.stringify(message));
                      if (message.data.type == 'ask'){
                        self.sequences[self.mapping[channelName]] = self.sequences[self.mapping[channelName]] + 1
                        tick = {
                            type: 'TICK',
                            tick:{
                                ask_price: message.data.rate,
                                ask_qty: message.data.amount,
                                ask_levels: 0,
                                bid_levels: 0,
                                exchange_timestamp: Date.now() / 1000,
                                marketfeed_timestamp: Date.now() / 1000,
                                bid_price: last_bid_price[channelName],
                                bid_qty: last_bid_qty[channelName],
                                symbol: self.mapping[channelName],
                                status: 'crypto',
                                exchange_code: channelName,
                                seq: self.sequences[self.mapping[channelName]],
                                exchange: 'poloniex'
                            }
                        }
                        last_ask_qty[channelName] = message.data.amount;
                        last_ask_price[channelName] = message.data.rate;
                        cb(tick);
                    }
                    // bid
                    else if (message.data.type == 'bid'){
                        self.sequences[self.mapping[channelName]] = self.sequences[self.mapping[channelName]] + 1
                        tick = {
                            type: 'TICK',
                            tick:{
                                ask_price: last_ask_price[channelName],
                                ask_qty: last_ask_qty[channelName],
                                ask_levels: 0,
                                bid_levels: 0,
                                exchange_timestamp: Date.now() / 1000,
                                marketfeed_timestamp: Date.now() / 1000,
                                bid_price: message.data.rate,
                                bid_qty: message.data.amount,
                                symbol: self.mapping[channelName],
                                status: 'crypto',
                                exchange_code: channelName,
                                seq: self.sequences[self.mapping[channelName]],
                                exchange: 'poloniex'
                            }
                        }
                        last_bid_qty[channelName] = message.data.amount;
                        last_bid_price[channelName] = message.data.rate;
                        cb(tick);
                    }
                }
            });
        });

        poloniex.on('open', () => {
          self.logger.info(`Poloniex WebSocket connection open`);
        });

        poloniex.on('close', (reason, details) => {
          self.logger.info(`Poloniex WebSocket connection disconnected`);
          process.exit(1);
        });

        poloniex.on('error', (error) => {
          self.logger.error(`An error has occured; ${JSON.stringify(error)}`);
          process.exit(1);
        });

        poloniex.openWebSocket();
    }

     // set instruments
    setInstruments(instruments){
        self.logger.info('Setting Poloniex price instruments subscription: %s', instruments);
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
module.exports.Poloniexmarketfeed = Poloniexmarketfeed;
