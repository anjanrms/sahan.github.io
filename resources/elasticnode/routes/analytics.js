"use strict";

var ghevents = require('../lib/ghevents');

exports.languages = function(req, res) {

    var q = req.query.q;
    
    ghevents.languageStats({
        query: {
            "match": {
                "payload.shas": (q instanceof Array)? q.join(' ') :q
            }
        },
        onSuccess: function(result) {
            res.send(result);   
        },
        onFailure: function(error) {
            res.send({
                'Oops!': [1]
            });
        }
    });
};
