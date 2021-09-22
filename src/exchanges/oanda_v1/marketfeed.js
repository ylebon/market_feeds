var https = require('https');
var path = require('path');
var winston = require('winston');
var loglevel = "info";

function OandaPricingV1(oandaSettings, instruments, loglevel) {
    this.oandaSettings = oandaSettings;
    this.instruments = instruments;
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

OandaPricingV1.prototype.start = function(cb){
    self = this
    self.logger.info('Starting Oanda price v1...' );

    // create request options
    req_options = {
        host: this.oandaSettings.stream_url,
        path: '/'+this.oandaSettings.version+'/prices?accountId=' + this.oandaSettings.account_id + '&instruments='+this.instruments,
        method: 'GET',
        headers: {"Authorization" : "Bearer " + this.oandaSettings.access_token},
    }

    // create oanda request
    var request = https.request(req_options, function(response){
        response.on("data", function(chunk){
            var bodyChunk = chunk.toString();
            var ticks = bodyChunk.split('\n').map(function(ele){
                return ele.trim();
            }).filter(function(ele){
                return ele != '';
            }).map(function(ele){
                return JSON.parse(ele);
            }).filter(function(ele){
                return 'tick' in ele;
            })
            ticks.forEach( function(tick) {
                var dt  = Date.parse(tick['tick'].time);
                tick['tick'].timestamp = dt/1000;
                // log tick
                self.logger.debug('Tick: %j', tick);
                // send result
                cb(tick);
            })
        });
        response.on("end", function(chunk){
            self.logger.error("Error connecting to OANDA HTTP Rates Server");
            self.logger.error("HTTP - " + response.statusCode);
            self.logger.error(chunk);
            process.exit(1);
        });
        response.on("error", function(erro){
            self.logger.error(erro);
            process.exit(1);
        });
    });

    // console log error
    request.on('error', function(e) {
      self.logger.error(e);
    });

    // end request
    request.end();

}

// node.js module export
module.exports.OandaPricingV1 = OandaPricingV1;




