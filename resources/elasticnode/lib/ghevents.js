"use strict";

var es = require('./esclient');
var defaultSize = 100;
var stargazedPushesFilter = {
  "and": {
      "filters" : [ 
      	  {
            "range" : { "stargazers" : { "gte" : 500 } }
          },
          {
            "term": { "type": "pushevent" }
          }
      ],
      "_cache" : true
  }
}

module.exports.languageStats = languageStats;

function languageStats(search) {

	es.runFilteredQuery(
		search.query,
		stargazedPushesFilter,
		search.size? search.size :defaultSize,
		search.from? search.from :0,

		function(err, res) {
			if(err) {
				search.onFailure(err);
			}
			else {
				var stats = {};
	            res.hits.hits.map(function(hit) {
	                var lang = hit._source.repository.language;
	                if(lang) {
	                    if(!stats[lang]) {
	                        stats[lang] = [];
	                    }
	                    stats[lang].push(hit);
	                }
	            });
				search.onSuccess(stats);
			}
		}
	);
}
