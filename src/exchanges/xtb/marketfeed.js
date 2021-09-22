var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
const WebSocket = require('ws');
const pako = require('pako');
const BSON = require('bson');


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
class XTBmarketfeed {

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
        self.logger.info('Starting XTB Market Data: %s', self.instruments);

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
        let data = null;
        let symbol = null;
        let channel = null;
        let last_pong = null;
        let stream_session_id = null;

        // socket url
        var websocketUri = 'ws://xapib.x-station.eu:5125';
        let socket;

        // Login
        function login(){
            var cmd = {
                "command": "login",
                "arguments": {
                }
            }
            socket.send(JSON.stringify(cmd));
        }

        // Get all symbols
        function getAllSymbols(){
            var cmd = {
                "command": "getAllSymbols"
            }
            socket.send(JSON.stringify(cmd));
        }

        // Get calendar
        function getCalendar(){
            var cmd = {
                "command": "getCalendar"
            }
            socket.send(JSON.stringify(cmd));
        }

        // Get balance
        function getBalance(){
            var cmd = {
                "command": "getKeepAlive"
            }
            socket.send(JSON.stringify(cmd));
        }

        // Get news
        function getNews(){
            var cmd = {
                "command": "getNews"
            }
            socket.send(JSON.stringify(cmd));
        }

        // Get ticks prices
        function getTickPrices(symbols){
            var cmd = {
                "command": "getTickPrices",
                "streamSessionId": stream_session_id,
                "symbols": symbols
            }
            console.log(cmd);
            socket.send(JSON.stringify(cmd));
        }

        function connect(){
            // web socket
            socket = new WebSocket(websocketUri);

            // on socket opened
            socket.on('open', () => {
                self.logger.info("msg='connection opened'");
                login();
            });

            // on message received
            socket.on('message', data => {
                self.logger.info("msg='received' data='"+data+"'");
                data = JSON.parse(data);
                if (stream_session_id === null) {
                    stream_session_id = data.streamSessionId;
                    //getAllSymbols();
                    getTickPrices(["EURUSD"])
                }

                if (data.returnData){
                    data.returnData.forEach(function(x){
                        console.log(x);
                    })
                }
            });

            // disconnect socket
            socket.on('error', data => {
                self.logger.error("msg='disconnected!!!!' message='"+data+"'");
            })

            // disconnect socket
            socket.on('close', data => {
                self.logger.warn("msg='disconnected!!!!' message='"+data+"'");
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
module.exports.XTBmarketfeed = XTBmarketfeed;
