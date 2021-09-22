var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
const CEXIO = require('cexio-api-node');

class Book{
    // book constuctor
    constructor(){
        this.bbo = {};
        this.last = {};
    }

    // update book
    update(instrument, asks, bids){
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

class Cexmarketfeed {

    // constructor
    constructor(settings, instruments, loglevel){
        this.settings = settings;
        this.instruments = instruments;
        this.sequences = {};
        this.book = new Book();
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
        self.logger.info('Starting Cex Market Data: %s', self.instruments);

        // cex options
        let cex = new CEXIO(self.settings.key, self.settings.secret);
        const cexWS = cex.ws;
        const cexRest = cex.rest;

         // update sequences
        for (var i in self.instruments){
            self.sequences[self.instruments[i]] = 0;
        }

        // update instruments format
        let instruments = self.instruments.map(function(instrument) {
          var instrument_new = instrument.replace("_", "-");
          self.mapping[instrument_new] = instrument;
          return instrument_new;
        });
        self.logger.debug("Instruments format send to exchange:", instruments);



        cexWS.on('open', function () {
            self.logger.info('Connection opened');
        })

        cexWS.on('error', function (error) {
            self.logger.error('error: \n', error)
        })

        let last;
        let instrument;
        let tick;
        let data;


        cexWS.on('message', function (msg) {
            if (msg.e === 'ping') {
                  self.logger.info("msg='received ping message", msg);
                  cexWS.send({e: 'pong'})
            } else if (msg.e == 'order-book-subscribe'){
                self.logger.debug("msg='message received' data=", msg.data);
                data = msg.data;
                instrument = data.pair.replace(':', '_');
                self.book.update(instrument, data.asks, data.bids);

                // get last tick
                last = self.book.getLast(instrument);

                // updates sequences
                self.sequences[instrument] = self.sequences[instrument] + 1;

                // tick
                tick = {type: 'TICK',
                    tick:{
                        ask_price: last.ask_price,
                        ask_qty: last.ask_qty,
                        ask_levels: data.asks.length,
                        bid_levels: data.bids.length,
                        exchange_timestamp: data.time/1000,
                        marketfeed_timestamp: Date.now() / 1000,
                        bid_price: last.bid_price,
                        bid_qty: last.bid_qty,
                        symbol: instrument,
                        status: 'crypto',
                        exchange_code: data.pair,
                        seq: self.sequences[instrument],
                        exchange: 'cex'
                    }
                }
            }else if(msg.e == 'connected') {
                self.logger.info("msg=connected data=", msg);
                cexWS.auth();
            }else if(msg.e == 'md_update') {
                self.logger.debug('Received message:', msg.data);
                data = msg.data;
                instrument = data.pair.replace(':', '_');
                self.book.update(instrument, data.asks, data.bids);
                // get last tick
                last = self.book.getLast(instrument);
                // updates sequences
                self.sequences[instrument] = self.sequences[instrument] + 1;

                // tick 
                tick = {type: 'TICK',
                    tick:{
                        ask_price: last.ask_price,
                        ask_qty: last.ask_qty,
                        ask_levels: data.asks.length,
                        bid_levels: data.bids.length,
                        exchange_timestamp: data.time/1000,
                        marketfeed_timestamp: Date.now() / 1000,
                        bid_price: last.bid_price,
                        bid_qty: last.bid_qty,
                        symbol: instrument,
                        status: 'crypto',
                        exchange_code: data.pair,
                        seq: self.sequences[instrument],
                        exchange: 'cex'
                    }
                }
                cb(tick);

            }else if(msg.e == 'auth') {
                self.logger.info("Authenticated:", msg);
                for (var i in instruments){
                    cexWS.subscribeOrderBook(instruments[i], true, 5);
                }
                setInterval(function () {
                    cexWS.close();
                }, 12 * 60 * 60 * 1000 );
            }else {
                self.logger.warn("unknown message type: ", msg.e);
                self.logger.warn(msg);
            }



        })

        cexWS.on('close', function () {
            self.logger.info("msg='webSocket disconnected'");
            cexWS.open();

        })

        cexWS.open();

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
module.exports.Cexmarketfeed = Cexmarketfeed;


