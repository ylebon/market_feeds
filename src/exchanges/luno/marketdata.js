var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
const WebSocket = require('ws');
const pako = require('pako');


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
class Lunomarketfeed {

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
        self.logger.info('Starting Luno Market Data: %s', self.instruments);

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

        const credentials = {
            "api_key_id": self.settings.key,
            "api_key_secret": self.settings.secret
        }

        let last;
        let instrument;
        let tick;
        let asks = [];
        let bids = [];
        let data = null;
        let symbol = null;
        let channel = null;
        let last_pong = null;

        // socket url
        var websocketUri = 'wss://ws.luno.com/api/1/stream/XBTEUR';
        let socket;

        function connect(){
            // web socket
            socket = new WebSocket(websocketUri);

            // on socket opened
            socket.on('open', () => {
                self.logger.info("msg='connection opened'");
                self.logger.info("msg='total number of instruments' total="+(self.instruments.length));
                socket.send(JSON.stringify(credentials))

            });

            // on message received
            let msg = null;
            let asks = null;
            let bids = null;
            let instrument = null;
            socket.on('message', data => {
                self.logger.debug("msg='received' data="+data);
                try {
                    if (data != "" && data.asks != undefined && data.bids != undefined){
                        msg = JSON.parse(data);
                        bids = msg.bids.map(function(x){
                            return [x.price,x.volume] 
                        })
                        asks = msg.asks.map(function(x){
                            return [x.price,x.volume] 
                        })
                        instrument = "XBTEUR"
                        self.book.update(instrument, asks, bids);
                    }
                    else if (data != "" && data.create_update != undefined){
                        msg = JSON.parse(data);
                        console.log(msg);
                    }
            
                } catch (error) {
                  self.logger.error("msg='failed to parse event data' error=", error);
                  return;
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
        self.logger.info('Setting Luno price instruments subscription: %s', instruments);
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
module.exports.Lunomarketfeed = Lunomarketfeed;
