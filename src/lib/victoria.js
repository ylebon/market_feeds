const axios = require('axios')
var winston = require('winston');

class Victoria{
    /// Victoria metrics
    constructor(address, loglevel){
        this.address = address;
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
            }
        );
    }

    // record tick
    record(tick){
        let self = this;
        let data = (tick['tick'].exchange+"_"+tick['tick'].symbol).toUpperCase();
        data = data + ",exchange=" + tick['tick'].exchange.toUpperCase();
        data = data + ",symbol=" + tick['tick'].symbol.toUpperCase();
        data = data + " ";

        // fields
        let fields = [];
        Object.keys(tick.tick).forEach(key => {
          if (tick.tick[key] !== undefined && tick.tick[key] != 0) {
            fields.push(key + "=" + tick.tick[key]);
          } 
        });
        data = data + fields.join(',');
        self.logger.debug('Post data: ', data);
        axios.post(this.address, data);
    }

}

module.exports.Victoria = Victoria;
