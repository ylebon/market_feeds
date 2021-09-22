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
class Okexmarketfeed {

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
        self.logger.info('Starting Okex Market Data: %s', self.instruments);

        // update instruments format
        var instruments = self.instruments.map(function(instrument) {
          var instrument_new = instrument.replace("_", "/");
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
        let data = null;
        let symbol = null;
        let channel = null;
        let last_pong = null;

        // socket url
        var websocketUri = 'wss://real.okex.com:10441/websocket';
        let socket;

        function connect(){
            // web socket
            socket = new WebSocket(websocketUri);

            // on socket opened
            socket.on('open', () => {
                self.logger.info("Connection: opened");
                self.logger.info("Total number of instruments: "+(self.instruments.length));
                last_pong = Date.now();
                for (let i in self.instruments){
                    (function(i){
                        var symbol = self.instruments[i].toLowerCase();
                        var subscription = {
                            event: 'addChannel',
                            channel: 'ok_sub_spot_' + symbol + '_' + "depth"
                        }
                        socket.send(JSON.stringify(subscription))
                    })(i)
                }
            });

            // on message received
            socket.on('message', data => {
                self.logger.debug("Received: "+data);
                try {
                    if (data instanceof String) {
                        data = JSON.parse(data);
                    } else {
                        data = JSON.parse(pako.inflateRaw(data, {to: 'string'}));
                    }
                } catch (error) {
                  self.logger.info("Failed to parse event data: ", error);
                  return;
                }
                try{
                    if (data[0]['channel'] != 'addChannel') {
                        channel = data[0]['channel'];
                        data = data[0]['data'];
                        symbol = channel.split("_")[3].toUpperCase() + "/" + channel.split("_")[4].toUpperCase()
                        self.book.update(symbol, data.bids, data.asks);
                        // get last tick
                        last = self.book.getLast(symbol);
                        // updates sequences
                        self.sequences[symbol] = self.sequences[symbol] + 1;
                        // tick

                        try{
                            tick = {
                                type: 'TICK',
                                tick:{
                                    ask_price: last.ask_price,
                                    ask_qty: last.ask_qty,
                                    ask_levels: data.asks.length,
                                    bid_levels: data.bids.length,
                                    exchange_timestamp: data.timestamp/1000,
                                    marketfeed_timestamp: Date.now() / 1000,
                                    bid_price: last.bid_price,
                                    bid_qty: last.bid_qty,
                                    symbol: self.mapping[symbol],
                                    status: 'crypto',
                                    exchange_code: symbol,
                                    seq: self.sequences[symbol],
                                    exchange: 'okex'
                                }
                            }
                            cb(tick);
                        } catch(e){
                            self.logger.error(e)
                        }
                    }
                }catch(e){
                    if (data.event == 'pong'){
                        last_pong = Date.now();
                        self.logger.info(data);
                    } else {
                        self.logger.error(data);
                    }
                }
            });

            // disconnect socket
            socket.on('close', data => {
                self.logger.warn("Disconnected!!!!");
                connect();
            })


        }

       setInterval(function() {
          if (socket.readyState == 1){
            socket.send(JSON.stringify({event:'ping'}))
          } else if (socket.readyState == 0){
            connect();
          }
       }, 30 * 1000);

        // destroy connection every 12 hours
        setInterval(function() {
            self.logger.info("Destroy connection");
            if (socket.readyState == 1){
                socket.terminate();
            }
        }, 12 * 3600 * 1000);

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
module.exports.Okexmarketfeed = Okexmarketfeed;
