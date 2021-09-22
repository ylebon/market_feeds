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

module.exports.Book = Book;
