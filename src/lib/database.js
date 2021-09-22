const Influx = require('influx');
const winston = require('winston');

class Database{
    constructor(address, loglevel){
        this.address = address;
        this.name = this.address.split('/')[3];
        this.dbClient = new Influx.InfluxDB(this.address);
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

    start(){
        let self = this;
        // create databases
        self.dbClient.getDatabaseNames().then(names => {
            if (!names.includes(self.name)) {
                return self.dbClient.createDatabase(self.name);
            }
        })
        .then(() => {
            self.logger.info('Database '+self.name+' created');
        })
        .catch(err => {
            self.logger.error(self.dbName)
            self.logger.error('Error creating Influx database: %s, error: %j!', self.dbName, err);
        })

    }

    // convert to milliseconds
    convertToMs(ts_sec) {
        var res = ts_sec.toString().split('.');
        const ms = (parseInt(res[0])*1000)+parseInt(res[1]);
        return ms;
    }

    // record tick
    record(tick){
        let self = this;

        // remove null value
        Object.keys(tick.tick).forEach(key => {
          if (tick.tick[key] === undefined || tick.tick[key] == 0) {
            delete tick.tick[key];
          }
        });

        self.dbClient.writePoints([{
            measurement: (tick['tick'].exchange+"_"+tick['tick'].symbol).toUpperCase(),
            fields: tick['tick'],
            timestamp: Date.now()
        }],
        
        {precision: 'ms'}).catch(err => {
            self.logger.error('Error saving data to InfluxDB! ${err.stack}', err)
            self.logger.error('Cannot save tick: ', tick['tick']);
        })
    }

}

module.exports.Database = Database;
