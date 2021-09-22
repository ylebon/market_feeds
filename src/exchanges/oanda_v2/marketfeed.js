var https = require('https');
var winston = require('winston');
var escapeJSON = require('escape-json-node');
var Book = require('../../lib/book').Book;

class Oandamarketfeed {

    // constructor
    constructor(settings, instruments, loglevel){
        this.settings = settings;
        this.instruments = instruments;
        this.book = new Book()
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

        // create request options
        let instruments = self.instruments.join('%2C');
        let req_options = {
            host: self.settings.stream_url,
            path: '/v3/accounts/'+self.settings.account_id+'/pricing/stream?instruments='+instruments,
            method: 'GET',
            headers: {"Authorization" : "Bearer " + self.settings.access_token},
        }

        // create sequences
        let sequences = {};
        for (var i in self.instruments){
            sequences[self.instruments[i]] = 0;
        }

        // establish connection
        let request;
        let last_heartbeat;
        function connect(){
             let asks_depth;
             let bids_depth;
             let symbol;
             let last;
             let exchange_timestamp;
             let tick;
             let update;
             let data = "";
             let updates = [];
             let buffer = "";
             let o_bracket = 0;
             let c_bracket = 0;
             let data_index = 0;
             request = https.request(req_options, function(response){
                self.logger.info("Connected");

                response.on("data", function(chunk){
                    // Fail to parse string
                    last_heartbeat = Math.floor(Date.now() / 1000);
                    data += chunk.toString('utf8').trim();
                    buffer = "";
                    updates = [];
                    data_index = 0;
                    o_bracket = 0;
                    c_bracket = 0;

                    data.split("").forEach(function(char, index, array){
                        buffer =  buffer + char;
                        if (char == '{'){
                            o_bracket = o_bracket + 1;
                        }
                        else if (char == '}'){
                            c_bracket = c_bracket + 1;
                        }
                        if ((o_bracket == c_bracket) && c_bracket>0){
                            update = JSON.parse(buffer);
                            updates.push(update);
                            buffer = "";
                            o_bracket = 0;
                            c_bracket = 0;
                            data_index = index + 1;
                        }
                    })

                    data = data.slice(data_index);

                    // updates
                    updates.forEach(function(update){
                        if (update.type == 'PRICE'){
                            symbol = update.instrument;

                            asks_depth = update.asks.map(function(x){
                                return [x.price, x.liquidity]
                            })

                            bids_depth = update.bids.map(function(x){
                                return [x.price, x.liquidity]
                            })

                            // update book
                            self.book.update(symbol, bids_depth, asks_depth);

                            // get last tick
                            last = self.book.getLast(symbol);

                            // updates sequences
                            sequences[symbol] = sequences[symbol] + 1;

                            // tick
                            exchange_timestamp = (new Date(update.time)).getTime() / 1000;

                            tick = {
                                type: 'TICK',
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
                                    status: update.status,
                                    exchange_code: symbol,
                                    seq: sequences[symbol],
                                    exchange: 'oanda'
                                }
                            }
                            cb(tick);
                        } else if (update.type == 'HEARTBEAT'){
                            last_heartbeat = Math.floor(Date.now() / 1000);
                            self.logger.info(update);
                        }
                    })
                });

                response.on("end", function(chunk){
                    self.logger.error("Connection with Oanda server was closed! Status Code: "+response.statusCode);
                    connect();
                });

                response.on("error", function(erro){
                    self.logger.error(erro);
                });
            });

            // console log error
            request.on('error', function(e) {
              self.logger.error(e);
            });

            request.shouldKeepAlive = false;


            // run
            request.end()

        }

        connect();

        setInterval(function() {
           if ((Math.floor(Date.now() / 1000) - last_heartbeat) > 30){
               self.logger.error("Timeout reached, reconnecting ...");
               request.destroy();
           }
        }, 30 * 1000);

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
