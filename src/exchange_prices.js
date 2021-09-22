var https = require('https');
var sync_request = require('sync-request');

var path = require('path');
var program = require('commander');
var winston = require('winston');
var yaml_config = require('node-yaml-config');
var router_ws = require('./lib/router_ws');
var victoria = require('./lib/victoria');
var database = require('./lib/database');

var yaml = require('node-yaml-config');
const hyperid = require('hyperid');
const instance = hyperid();

class ExchangePrices{
    constructor(exchange, instruments, router_addr, database_addr, save, publish, victoria_db, loglevel){
        this.loglevel = loglevel.toLowerCase();
        this.router = new router_ws.RouterWS(router_addr, loglevel);
        this.victoria_db = victoria_db;
        if (this.victoria_db) {
            this.database = new victoria.Victoria(database_addr, loglevel);
        } else {
            this.database = new database.Database(database_addr, loglevel);
        }
        this.save = save;
        this.publish = publish;
        this.exchange = exchange;
        this.instruments = instruments;
        this.uuid_instance = hyperid();
        this.logger = new (winston.Logger)({
            transports: [
                new (winston.transports.Console)(
                {
                colorize: true,
                timestamp: function() {
                    return new Date().toISOString();
                },
                level: this.loglevel
                })
            ]
            }
        );


    }

    start(){
        let self = this;

        // load exchange market data
        if (self.exchange.toLowerCase() == 'oanda'){
            var oanda_marketfeed = require('./exchanges/oanda_v2/marketfeed');
            const settingsFile = path.join(__dirname, 'settings.yaml')
            const settings = yaml.load(settingsFile);
            const exchangeSettings = settings.brokers.oanda.live;
            var instruments_json = require(path.join(__dirname, 'exchanges', 'oanda_v2', 'data', 'instruments.json'));
            // exclude instruments
            var exclude_instruments = [];
            try {
                exclude_instruments =process.env.INSTRUMENTS_EXCLUDE.split(",");
            } catch (err){
                console.error("Failed to parse excluded instruments!");
            }


            // return all instruments
            var all_instruments = instruments_json.instruments.filter(function(x_1){
                return exclude_instruments.indexOf(x_1.instrument) < 0;
            }).map(function(x_2){
                return x_2.instrument;
            })
            this.instruments = this.instruments  || all_instruments;
            this.marketfeed = new oanda_marketfeed.Oandamarketfeed(exchangeSettings, this.instruments, self.loglevel);
        } else if(this.exchange.toLowerCase() == 'poloniex'){
            var poloniex_marketfeed = require('./exchanges/poloniex/marketfeed');
            const settingsFile = path.join(__dirname, 'settings.yaml')
            const settings = yaml.load(settingsFile);
            const exchangeSettings = settings.brokers.poloniex.live;
            var res = sync_request('GET','https://poloniex.com/public?command=returnTicker');
            var body = JSON.parse(res.getBody('utf8'));
            var base_quote;
            var all_instruments = [];
            all_instruments = Object.keys(body).map(function(key){
                base_quote = key.split("_");
                return key.split("_")[1] + "_" + key.split("_")[0]
            })
            if (process.env.INSTRUMENT_QUOTE){
                all_instruments = all_instruments.filter(function(x){
                    return x.split('_')[1] == process.env.INSTRUMENT_QUOTE;
                })
            } else if (process.env.INSTRUMENTS){
                return process.env.INSTRUMENTS.split(',')
            }
            this.instruments = this.instruments  || all_instruments;
            this.marketfeed = new poloniex_marketfeed.Poloniexmarketfeed(exchangeSettings, this.instruments, self.loglevel)
        } else if(this.exchange.toLowerCase() == 'binance'){
            var binance_marketfeed = require('./exchanges/binance/marketfeed');
            const settingsFile = path.join(__dirname, 'settings.yaml')
            const settings = yaml.load(settingsFile);
            const exchangeSettings = settings.brokers.binance.live;
            var res = sync_request('GET','https://api.binance.com/api/v1/exchangeInfo');
            var body = JSON.parse(res.getBody('utf8'));

             var all_instruments = body.symbols.map(function(x){
                    return x.baseAsset+'_'+x.quoteAsset;
             })

            if (process.env.INSTRUMENT_QUOTE){
                all_instruments = all_instruments.filter(function(x){
                    return x.split('_')[1] == process.env.INSTRUMENT_QUOTE;
                })
            }

            this.instruments = this.instruments  || all_instruments;
            self.logger.info("Total instruments: "+this.instruments.length);
            this.marketfeed = new binance_marketfeed.Binancemarketfeed(exchangeSettings, this.instruments, self.loglevel)
        }else if(this.exchange.toLowerCase() == 'cex'){
            var cex_marketfeed = require('./exchanges/cex/marketfeed');
            const settingsFile = path.join(__dirname, 'settings.yaml')
            const settings = yaml.load(settingsFile);
            const exchangeSettings = settings.brokers.cex.live;
            var res = sync_request('GET','https://cex.io/api/currency_limits');
            var body = JSON.parse(res.getBody('utf8'));
            var all_instruments = body.data.pairs.map(function(x){
                return x.symbol1+'_'+x.symbol2;
            })
            this.instruments = this.instruments  || all_instruments;
            this.marketfeed = new cex_marketfeed.Cexmarketfeed(exchangeSettings, this.instruments, self.loglevel)
        }else if(this.exchange.toLowerCase() == 'kraken'){
            var kraken_marketfeed = require('./exchanges/kraken/marketfeed');
            const settingsFile = path.join(__dirname, 'settings.yaml')
            const settings = yaml.load(settingsFile);
            const exchangeSettings = settings.brokers.kraken.live;
            this.instruments = this.instruments  || exchangeSettings.symbols.map(x => x.symbol);
            this.marketfeed = new kraken_marketfeed.Krakenmarketfeed(exchangeSettings, this.instruments, self.loglevel)
        }else if(this.exchange.toLowerCase() == 'cobinhood'){
            var cobinhood_marketfeed = require('./exchanges/cobinhood/marketfeed');
            const settingsFile = path.join(__dirname, 'settings.yaml')
            const settings = yaml.load(settingsFile);
            const exchangeSettings = settings.brokers.cobinhood.live;
            var res = sync_request('GET', 'https://api.cobinhood.com/v1/market/trading_pairs');
            var body = JSON.parse(res.getBody('utf8'));;
            var all_instruments = body.result.trading_pairs.map(function(x){
                return x.id.replace('-', '_');
            })
            this.instruments = this.instruments  || exchangeSettings.symbols;
            this.marketfeed = new cobinhood_marketfeed.Cobinhoodmarketfeed(exchangeSettings, self.instruments, self.loglevel)
        }else if(this.exchange.toLowerCase() == 'bitstamp'){
            var bitstamp_marketfeed = require('./exchanges/bitstamp/marketfeed');
            const settingsFile = path.join(__dirname, 'settings.yaml')
            const settings = yaml.load(settingsFile);
            const exchangeSettings = settings.brokers.bitstamp.live;
            var res = sync_request('GET', 'https://www.bitstamp.net/api/v2/trading-pairs-info/');
            var body = JSON.parse(res.getBody('utf8'));
            var all_instruments = body.map(function(x){
                return x.name.replace('/', '_');
            })
            this.instruments = this.instruments  || all_instruments;
            this.marketfeed = new bitstamp_marketfeed.Bitstampmarketfeed(exchangeSettings, self.instruments, self.loglevel)
        } else if(this.exchange.toLowerCase() == 'okex'){
            var okex_marketfeed = require('./exchanges/okex/marketfeed');
            var res = sync_request('GET', 'https://www.okex.com/v2/spot/markets/products');
            var body = JSON.parse(res.getBody('utf8'));
            var all_instruments = body.data.map(function(x){
                return x.symbol.toUpperCase();
            })
            if (process.env.INSTRUMENT_QUOTE){
                all_instruments = all_instruments.filter(function(x){
                    return x.split('_')[1] == process.env.INSTRUMENT_QUOTE;
                })
            }
            this.instruments = this.instruments || all_instruments;
            self.logger.info("Total instruments: "+this.instruments.length);
            var exchangeSettings = null;
            this.marketfeed = new okex_marketfeed.Okexmarketfeed(exchangeSettings, self.instruments, self.loglevel)
        }
        else if(this.exchange.toLowerCase() == 'xtb'){
            var xtb_marketfeed = require('./exchanges/xtb/marketfeed');
            this.instruments = ['EUR_USD']
            self.logger.info("Total instruments: "+this.instruments.length);
            var exchangeSettings = null;
            this.marketfeed = new xtb_marketfeed.XTBmarketfeed(exchangeSettings, self.instruments, self.loglevel)
        }
        else if(this.exchange.toLowerCase() == 'luno'){
            let luno_marketfeed = require('./exchanges/luno/marketfeed');
            const settingsFile = path.join(__dirname, 'settings.yaml')
            const settings = yaml.load(settingsFile);
            this.instruments = this.instruments  || all_instruments;
            self.logger.info("Total instruments: "+this.instruments.length);
            const exchangeSettings = settings.brokers.luno.live;
            this.marketfeed = new luno_marketfeed.Lunomarketfeed(exchangeSettings, self.instruments, self.loglevel)
        }
        else {
            self.logger.info("Unknown exchange: ", self.exchange);
            process.exit(-1);
        }


        // callback session
        function publish_callback(message){
            // add tick ID
            if (message.type == 'TICK') {
                message.tick.unique_id = self.uuid_instance();
            }

            // publish message
            self.router.publish(message);

            // record message
            if (message.type == 'TICK' && self.save){
                self.database.record(message);
            }
        }

        // callback session
        function callback(message){
            // add tick ID
            if (message.type == 'TICK') {
                message.tick.unique_id = self.uuid_instance();
            }

            // record message
            if (message.type == 'TICK' && self.save){
                self.database.record(message);
            }
        }

        if (self.publish) {
            // start exchange prices
            self.router.connect(function(session){
                // reset instruments sequence id
                var topic;
                var message = {};

                for (var i in self.instruments){
                    message = {
                        type: 'RESET_SEQUENCE',
                        reset_sequence: {
                            exchange: self.exchange,
                            symbol: self.instruments[i].toLowerCase(),
                        }
                    }
                    self.router.publish(message);
                }

                // list symbols
                function listSymbols(){
                    return self.instruments;
                }

                // register
                self.router.register('varatra.marketfeed.'+self.exchange.toLowerCase()+'.list_symbols', listSymbols);
                self.router.register('varatra.marketfeed.exchange.'+self.exchange+'.instruments.get', self.marketfeed.getInstruments);
                self.router.register('varatra.marketfeed.exchange.'+self.exchange+'.instruments.set', self.marketfeed.setInstruments);
                self.router.register('varatra.marketfeed.exchange.'+self.exchange+'.instruments.update', self.marketfeed.updateInstruments);

                // callback
                self.marketfeed.start(publish_callback);
            });
        } else {
            self.marketfeed.start(callback);
        }

    }
}

// parse command line parameters
program
  .version('0.0.1')
  .option('-e, --exchange <exchange>', 'set the exchange host. defaults to oanda')
  .option('-r, --router <router>', 'set the router host. defaults to localhost')
  .option('-d, --database <database>', 'set the database host. defaults to localhost')
  .option('-i, --instruments [value]', 'instruments', function(val){return val.split(',')})
  .option('-c, --c <config>', 'set the exchange config. defaults to practice')
  .option('-l, --loglevel <loglevel>', 'set the log level. defaults to info')
  .option('-s, --save', 'save to database')
  .option('-m, --victoria', 'victorya metrics')
  .option('-p, --publish', 'publish to router')
  .parse(process.argv);


// set the router
if (program.router) {
    program.router = 'ws://'+program.router+'/ws';
} else{
    program.router = 'ws://localhost:8080/ws';
}

// set the database
if (!program.database) {
    program.database = "http://localhost:8086/prices";

}

// set the logging
if (!program.loglevel) {
    program.loglevel = "info";

}

// start prices
if (!program.instruments) {
    var instrument = [];
    try{
        program.instruments = process.ENV.instruments.split(",");
    }catch(err){
        console.error("msg='not loading instruments from environment'");
    }
}

const exchangePrices = new ExchangePrices(program.exchange, program.instruments, program.router, program.database, program.save, program.publish, program.victoria, program.loglevel);

setTimeout(function(){
    exchangePrices.start();
}, 10000);


