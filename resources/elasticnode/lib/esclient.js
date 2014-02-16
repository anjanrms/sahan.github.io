"use strict";

var es = require('elasticsearch');
var client = new es.Client();
var index = 'github';
var type = '2014-02-02-14'; 

module.exports.runFilteredQuery = runFilteredQuery;

function runFilteredQuery(query, filter, size, from, callback) {

    client.search({
        index: index,
        type: type,
        size: size,
        from: from,
        body: {
            query: {
                filtered: {
                    query: query,
                    filter: filter
                }
            }
        }
    }, callback);
};
