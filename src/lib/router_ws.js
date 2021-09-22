var autobahn = require('autobahn');
var winston = require('winston');


class RouterWS {
  constructor(address, loglevel) {
    this.address = address;
    this.connection = null;
    this.session = null;
    this.loglevel = loglevel;
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

  connect(callback){
    var self = this;
    // logging
    self.logger.info('Connecting to "'+this.address+'"');
    // connection
    this.connection = new autobahn.Connection({
        url: this.address,
        realm: 'realm1'
    });

    // open autobahn connection
    self.connection.onopen = function (session) {
        // connection
        self.logger.info('Prices node connected to router');
        // update session
        self.session = session;
        // notification message
        const not = {service:'marketfeed', level:'INFO', message: 'Market data node connected to Crossbar router', date: new Date().toISOString()}
        // publish notification
        self.session.publish('varatra.notification', [not], {}, { acknowledge: true}).then(
            function(publication) {
                self.logger.debug('Published on topic "%s", publication ID: %j', 'varatra.notification', publication);
            },
            function(error) {
                self.logger.error("Failed to publish on topic %s. error: %j", 'varatra.notification', error);
            }
        );
        // call callback
        callback(session);
    }

    // one close connection
    this.connection.onclose = function (reason, details) {
        self.logger.error('Connection to router closed. Reason:', reason);
    }

    self.connection.open();
  }

  // publish message
  publish(message){
    var self = this;
    let topic = null;

    // TICK
    if (message.type == 'TICK'){
        topic = 'varatra.marketfeed.'+message.tick.exchange+'.price.'+message.tick.symbol.toLowerCase()+'.last_price';
    }

    // TRADE
    else if(message.type == 'TRADE'){
        topic = 'varatra.marketfeed.'+message.trade.exchange+'.trade.'+message.trade.symbol.toLowerCase();
    }

    // RESET SEQUENCE
    else if (message.type == 'RESET_SEQUENCE'){
        topic = 'varatra.prices.exchange.'+message.reset_sequence.exchange+'.'+message.reset_sequence.symbol.toLowerCase()+'.reset_sequence';
    }

    self.session.publish(topic, [message], {}, { acknowledge: true}).then(
        function(publication) {
            self.logger.debug("Published on topic `%s`, publication ID is `%j`", topic, publication);
            self.logger.debug("Message:", message);
        },
        function(error) {
            self.logger.error("Failed to publish on topic `%s`. error: `%j`", topic, error);
        }
    );
  }

  // register procedure
  register(proc_name, proc_func){
    var self = this;
    this.session.register(proc_name, proc_func).then(
        function (reg) {
            self.logger.info('Registered procedure `%s`', proc_name);
        },
        function (err) {
            self.logger.error('Failed to register procedure `%j`', err);
        }
    );
  }

  // send tick
  sendTick(tick){
    const topic = 'varatra.prices.'+tick['tick'].exchange+'.'+tick['tick'].symbol.toLowerCase();
    this.publish(topic, tick);
  }

}
module.exports.RouterWS = RouterWS;
