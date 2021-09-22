var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
var Pusher = require('pusher-client');
const WebSocket = require('ws');


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
class Bitstampmarketfeed {

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
        self.logger.info('Starting Bistamp Market Data: %s', self.instruments);

        // binance options
        // Authenticated client, can make signed calls
        var bitstamp_options = {
            encrypted: true,
            live_trades: false,
            order_book: false,
            diff_order_book: false,
        };


        // update instruments format
        var instruments = self.instruments.map(function(instrument) {
          var instrument_new = instrument.replace("_", "").toLowerCase();
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

        // socket url
        var websocketUri = 'wss://ws.bitstamp.net';
        let socket;

        function connect(){
            // web socket
            socket = new WebSocket(websocketUri);

            // on socket opened
            socket.on('open', () => {
                self.logger.info("msg='connection opened'");
                self.logger.info("msg='total number of instruments' total="+(self.instruments.length));

                for (let i in instruments){
                    let order_book_channel = socket.send(JSON.stringify({
                        "event": "bts:subscribe",
                        "data": {
                            "channel": 'order_book_'+instruments[i]
                        }
                    }));
                }

            });

            // on message received
            let msg = null;
            let data = null;
            let instrument = null;
            socket.on('message', data => {
                self.logger.debug("msg='received' message="+data);
                msg = JSON.parse(data);
                if (msg.event == "data") {
                    data = msg.data;
                    data['instrument']  = msg.channel.split("_")[2];
                    
                    self.book.update(data.instrument, data.bids, data.asks);

                    // get last tick
                    last = self.book.getLast(data.instrument);

                    // updates sequences
                    self.sequences[data.instrument] = self.sequences[data.instrument] + 1

                    tick = {type: 'TICK',
                        tick:{
                            ask_price: last.ask_price,
                            ask_qty: last.ask_qty,
                            ask_levels: data.bids.length,
                            bid_levels: data.asks.length,
                            exchange_timestamp: parseInt(data.microtimestamp)/1000000,
                            marketfeed_timestamp: Date.now() / 1000,
                            bid_price: last.bid_price,
                            bid_qty: last.bid_qty,
                            symbol: self.mapping[data.instrument],
                            status: 'crypto',
                            exchange_code: data.instrument,
                            seq: self.sequences[data.instrument],
                            exchange: 'bitstamp'
                        }
                    }
                    cb(tick);
                }
                
            });

            // disconnect socket
            socket.on('close', data => {
                self.logger.warn("msg='disconnected!!!!'");
                connect();
            })


        }


        connect();

        
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
module.exports.Bitstampmarketfeed = Bitstampmarketfeed;
