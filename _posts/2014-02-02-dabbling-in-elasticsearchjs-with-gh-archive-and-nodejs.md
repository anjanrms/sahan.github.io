---
layout: post
title: "Dabbling in ElasticSearch(.js) with GH-Archive and NodeJS"
category: posts
---

<br>
So I've been experimenting with [ElasticSearch](http://elasticsearch.org) (ES) which seems to excel at performing full-text searches on JSON documents over a RESTful API. It's powered by [Apache Lucene](http://lucene.apache.org/) and offers real-time indexing and searching with a slick Query DSL. Let's give it a spin.   

I'll be using [v0.90.10](http://www.elasticsearch.org/download/) with data from the [GitHub-Archive](http://githubarchive.org) to create an index of GitHub events and run some searches using the query DSL (on Linux). Next, we'll see how this works with the JavaScript API using a minimal NodeJS application.   

<br>
Download the distribution from [elasticsearch.org](http://www.elasticsearch.org/download) and extract it. Move into to the bin directory and run **elasticsearch** with the **-f** option.   

<pre class="terminal">
<c>wget</c> https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-0.90.10.tar.gz

<c>tar -zxf</c> elasticsearch-0.90.10.tar.gz

<c>cd</c> elasticsearch-0.90.10/bin

<c>./</c>elasticsearch -f
</pre>
> ES is written [entirely in Java](https://github.com/elasticsearch/elasticsearch) and requires a Java runtime with the JAVA_HOME environment variable pointing to it.   

<br>
This will start a single server node on [localhost:9200](http://localhost:9200) which we can confirm with a **GET** request.   

<pre class="terminal">
<c>curl -XGET</c> localhost:9200

{
  "ok" : true,
  "status" : 200,
  "name" : "Banner, Betty Ross",
  "version" : {
    "number" : "0.90.10",
    "build_hash" : "0a5781f44876e8d1c30b6360628d59cb2a7a2bbb",
    "build_timestamp" : "2014-01-10T10:18:37Z",
    "build_snapshot" : false,
    "lucene_version" : "4.6"
  },
  "tagline" : "You Know, for Search"
}
</pre>
> If you started ES in the background (without -f) use `curl -XPOST localhost:9200/_cluster/nodes/_local/_shutdown` to shutdown the node.   

<br>
In ES lingo, a **node** is a live ES server instance with possibly multiple indices. An **index** contains JSON **documents** of different types, where one **type** shares the same *schema*. Nodes that share the same indices belong to a single **cluster**. To get a feel of how you can work with the [RESTful API](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/docs.html), let's create an index and insert some documents to read, update and delete them.   

<br>
<h5>Dash through the single document API</h5>
<br>

I'm going to create some of my favorite Marvel characters in an index called **marvel**. I can create this index [manually](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/indices-create-index.html) with `curl -XPUT localhost:9200/marvel` or I could let ES create it for me by indexing a document right away.   

<pre class="terminal">
<c>curl -XPUT</c> localhost:9200/marvel/mutant/rogue -d'{

"name":"Anna Marie",
"gender":"female",
"abilities":["lifeforce siphoning", "power mimicry"]

}'

{"ok":true,"_index":"marvel","_type":"mutant","_id":"rogue","_version":1}
</pre>
> You can check out the chrome extension [Sense](https://github.com/bleskes/sense) to help you with these commands.   


<br>
This will create a **type** called **mutant** containing a single document with **rogue** as the **id**.  We can **read** this by issuing a **GET** request.    

<pre class="terminal">
<c>curl -XGET</c> localhost:9200/marvel/mutant/rogue

{"_index":"marvel","_type":"mutant","_id":"rogue","_version":1,"exists":true, "_source" : {

"name":"Anna Marie",
"gender":"female",
"abilities":["lifeforce siphoning", "power mimicry"]

}}
</pre>
> Issue this request with the `pretty` query parameter to pretty-print the JSON output, e.g. `curl -XGET localhost:9200/marvel/mutant/rogue?pretty`   

<br>
We can **update** this document with a **POST** or **PUT** request by identifying it with the same id.

<pre class="terminal">
<c>curl -XPOST</c> localhost:9200/marvel/mutant/rogue -d'{

"name":"Anna Marie",
"gender":"female",
"abilities":["lifeforce siphoning", "power mimicry"],
"teams":["X-Men", "X.S.E.", "Brotherhood of Mutants"]

}'

{"ok":true,"_index":"marvel","_type":"mutant","_id":"rogue","_version":2}
</pre>
> Notice that the version has been incremented.   

<br>
We could **delete** this document by issuing a **DELETE** request and a subsequent **GET** request will confirm that the document will not exist.   

<pre class="terminal">
<c>curl -XDELETE</c> localhost:9200/marvel/mutant/rogue

{"ok":true,"found":true,"_index":"marvel","_type":"mutant","_id":"rogue","_version":3}

<c>curl -XGET</c> localhost:9200/marvel/mutant/rogue?pretty

{
  "_index" : "marvel",
  "_type" : "mutant",
  "_id" : "rogue",
  "exists" : false
}
</pre>

<br>
...and if I wanted to save [Vision](http://marvel.com/characters/bio/1009697/vision), who's an android, I'd create a new type called **android** and insert him there instead.   

<pre class="terminal">
<c>curl -XPUT</c> localhost:9200/marvel/android/vision -d'{

"name":"Vision",
"gender":"male",
"abilities":["density control", "energy projection"]

}'

{"ok":true,"_index":"marvel","_type":"android","_id":"vision","_version":1}
</pre>

<br>
Next, we'll create an index of GitHub events typed under each day using data from the [GitHub Archive](http://www.githubarchive.org).

<br>
<h5>Indexing GitHub Timeline Archives</h5>
<br>

[GitHub Archive](http://www.githubarchive.org) collects all public event data for each hour and makes them available for further analysis. We'll use such an archive to create an index of GitHub events for a certain hour in a particular day. The first step would be to download and extract an archive of your choice.   

<pre class="terminal">
<c>wget</c> http://data.githubarchive.org/2014-02-02-14.json.gz

<c>gunzip</c> 2014-02-02-14.json.gz
</pre>
> Archived public events for the 2nd of February, 2014 at 2:00 PM UTC.   

<br>
This gives you the file `2014-02-02-14.json` which is a hefty 3.4 MB and lists 12,810 JSON objects (i.e. our documents) line-by-line. Note that this is not a properly structured JSON array - which, as you will realize shortly, is to our advantage. Now that we have the data, I'd like to keep it in an index named **github** under the type **2014-02-02-14**. So how would one go about indexing 12,810 documents? By using the [Bulk API](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/docs-bulk.html). 

The actions **index**, **create**, **delete** and **update** (since v0.90.1) can be performed in bulk against the endpoint `localhost:9200/_bulk`. This endpoint accepts data in the following format, where each line specifies an action (along with the metadata - index, type, id) followed by another optional line containing a JSON document (e.g. for a create action).   

<pre>
<font color="#0C7EA1">action
[document]</font>
<font color="#585858">action
[document]</font>
...
</pre>
> The JSON document should not be pretty-printed and should occupy just one line.   

<br>
For a bulk index operation on the documents, the event data should assume the following format.   

<pre>
<font color="#0C7EA1">{ "index" : { "_index" : "github", "_type" : "2014-02-02-14", "_id" : "1" } }
{"created_at":"2014-02-02T14:03:23-08:00", ...}</font>
<font color="#585858">{ "index" : { "_index" : "github", "_type" : "2014-02-02-14", "_id" : "2" } }
{"created_at":"2014-02-02T14:03:23-08:00", ...}</font>
...
</pre>
> An indexing action on every document, with the line number being assigned as the id.   

<br>
We can use [awk](http://www.hcs.harvard.edu/~dholland/computers/awk.html) to make this transformation and post the data to the bulk endpoint.   

<pre class="terminal">
<c>awk</c> '{print "{\"index\":{\"_index\":\"github\",\"_type\":\"2014-02-02-14\",\"_id\":\""NR"\"}}" }1' 2014-02-02-14.json > index.json

<c>curl -s -XPOST</c> localhost:9200/_bulk --data-binary @index.json
</pre>
> You might even use the endpoints `localhost:9200/github/_bulk` or `localhost:9200/github/2014-02-02-14/_bulk` in which case the index and/or type can be skipped from the individual actions.

<br>
Once we're done with that, we can start searching the documents to make use of all this event data. A search endpoint terminates with `_search` and is available on the whole node (e.g. `localhost:9200/_search`) or restricted to an index and type (e.g. `localhost:9200/github/_search`,  `localhost:9200/github/2014-02-02-14/_search`).   

ES supports [URI searching](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/search-uri-request.html) for simple queries on fields. Let's try one to make sure we've indexed our data properly.   
> You might want to use [Sense](https://github.com/bleskes/sense) for these queries to have them pretty printed.   

<pre class="terminal">
<c>curl</c> -XGET localhost:9200/github/2014-02-02-14/_search?q=language:Java

{
  "took": 7,
  "timed_out": false,
  "_shards": {
    "total": 5,
    "successful": 5,
    "failed": 0
  },
  "hits": {
    "total": 1178,
    "max_score": 3.5452383,
    "hits": [
      {
        "_index": "github",
        "_type": "2014-02-02-14",

...
</pre>
> Searches the type `2014-02-02-14` on index `github` for all events associated with a repository whose *language* is `Java`.   

<br>
The result is a single JSON object which describes some query statistics and gives you the matching documents in an array named `hits` under the key `_source`. The enclosing object is also named hits and specifies the total number of matching documents and the maximum score. A score is an indication of how similar each document was to the query. If you're interested to see how ES arrives this score, retry the query with the **explain** parameter.   

<pre class="terminal">
<c>curl</c> -XGET 'localhost:9200/github/2014-02-02-14/_search?q=language:Java&explain'
</pre>
> Scoring information can be found in the object `_explanation`.   

<br>
If you're paying attention to a only a few selected properties in the resulting documents, use the **fields** parameter to restrict the information you want by specifying a comma-separate list of fields.   

<pre class="terminal">
<c>curl</c> -XGET 'localhost:9200/github/2014-02-02-14/_search?q=language:Java&fields=repository'
</pre>
> Which gives you only the repository information under `fields`.   

<br>
You might notice that even though the total number of hits were 1178, the array contains only 10 objects. This is to be expected since ES returns only 10 hits by default. You can change this with the **size** parameter and use the **from** parameter to paginate across all the hits.   

<pre class="terminal">
<c>curl</c> -XGET 'localhost:9200/github/2014-02-02-14/_search?q=language:Java&fields=repository&size=50&from=200'
</pre>

<br>
URI searching will only get you so far. For analytics you should be using the [Query DSL](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl.html). 


<br>
<h5>A primer on Query DSL</h5>
<br>

This separate [DSL](https://en.wikipedia.org/wiki/Domain-specific_language) is written in JSON and helps you construct *compound* queries by expressing restrictions in *atomic* (or compound) queries which can be combined and filtered. One of the simplest queries which can be executed is the `match_all` query which matches *all* documents.   

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
    "match_all": {}
  }
}'

{
  "took": 4,
  "timed_out": false,
  "_shards": {
    "total": 5,
    "successful": 5,
    "failed": 0
  },
  "hits": {

...
</pre>

<br>
The Query DSL is written within a property named `"query"` in a JSON object and *posted* to the search endpoint. If we wanted to retry our previous search for all events associated with a repository whose primary language is Java, we would use a [`term`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-term-query.html) query, which is an example of an atomic query.   

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
      "term": { "language":"java" }
  }
}'
</pre>
> Use lowercase for the field value.   

<br>
Let's restrict this to push events. I can use two term queries within a [`bool`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-bool-query.html) query, which is an example of a compound query. I'll include the *size* property to make sure I get the first 50 hits.   

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
      "bool": {
          "must" : [ 
            { 
              "term" : { "language":"java" } 
            },
            { 
              "term" : { "type":"pushevent" } 
            }
        ]
      } 
    },
  "size": 50
}'
</pre>

<br>
The query above is essentially a match for exact values; the scores of individual hits are of no concern and the results are unlikely to change. So we could replace it with a [filter](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-filters.html) instead. Results of filters are cached and made available to other compound queries which might use the filter with the **same parameters**. Such queries will see a clear performance gain compared with the version that doesn't use the filter. Let's try the filter by wrapping it in a [`constant_score`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-constant-score-query.html) query.   

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
      "constant_score": {
          "filter": {
              "bool": {
                 "must" : [ 
                    { 
                      "term" : { "language":"java" } 
                    },
                    { 
                      "term" : { "type":"pushevent" } 
                    }
                 ],
                 "_cache": true
              }
          }
      } 
  }              
}'
</pre>
> The result of the bool filter is not cached by default - caching is enabled with `"_cache": true`   

<br>
A term query is an example where the text provided is not analyzed. If we wanted all events associated with a repository whose description contains any of the words "nodejs" or "node**.**js" we might use a [`match`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-match-query.html) query. A match query will analyze the given text and construct a boolean query of type *OR* by default.    

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
      "match": {
          "repository.description": "nodejs node.js"
      } 
  }              
}'
</pre>

<br>
We could switch this to an *AND* type by enclosing the field value in a separate object that identifies the boolean operator.

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
      "match": {
          "repository.description": {
              "query": "jquery plugin",
              "operator" : "and"
          }
      }
  }       
}'
</pre>

<br>
ES also provides you with a [`regexp`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-regexp-query.html) query which is effectively a term query that uses a regular expression.   

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
      "regexp": {
          "language": "java(script)?"
      } 
  }              
}'
</pre>
> Note that wildcards matches will affect you performance. Check out the [`wildcard`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-wildcard-query.html) query as well.   

<br>
The [`range`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-range-query.html) query might be useful for numeric fields. For example, to retrieve all events associated with a repository whose primary language is either Java or JavaScript with a stargazer count greater than or equal to 1000.   

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
      "bool": {
          "must" : [ 
              {
                "regexp": { "language": "java(script)?" }
              },
              {
                "range" : { "stargazers" : { "gte" : 1000 } }
              }
          ]
      }    
  }
}'
</pre>

<br>
We could rewrite the above as an [`and`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-and-filter.html) filter and apply on any query by executing it as a *filtered query*.   

<pre class="terminal">
<c>curl</c> -XPOST localhost:9200/github/2014-02-02-14/_search -d '
{
  "query": {
      "filtered" : {

          "query": {
              "match": {
                  "repository.description": "mobile"
              } 
          },

          "filter": {
              "and": {
                  "filters" : [ 
                      {
                        "regexp": { "language": "java(script)?" }
                      },
                      {
                        "range" : { "stargazers" : { "gte" : 1000 } }
                      }
                  ],
                  "_cache" : true
              }    
          }
      }
  }
}'
</pre>

<br>
That was a quick dash through the basics. For your full-stack JavaScript applications, ES provides a convenient [JS API](http://www.elasticsearch.org/guide/en/elasticsearch/client/javascript-api/current/about.html) which can be used with [NodeJS](http://nodejs.org/download/). Let's look at a minimal example which showcases this API.   


<br>
<h5>Working with ElasticSearch.js and NodeJS</h5>
<br>

We'll be creating a simple application with [ExpressJS](http://expressjs.com) v3.4.8 using [JADE](http://jade-lang.com/) as the template engine. We'll be using [morris.js](http://www.oesmith.co.uk/morris.js/) as well for a crude visualization of the data. To get started quickly, install express globally and generate a boilerplate.   

<pre class="terminal">
<c>npm</c> install -g express
<c>express</c> elasticnode
<c>cd</c> elasticnode
<c>npm</c> install
</pre>
> Run `node app.js` and make sure the app is available at [localhost:3000](http://localhost:3000/)   

<br>
Next, install ElasticSearch.js, verify this in *package.json* and edit the name as well.   

<pre class="terminal">
<c>npm install</c> --save elasticsearch
</pre>

<h6>package.json</h6>
{% highlight JSON %}
{
  "name": "ElasticNode",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "express": "3.4.8",
    "jade": "*",
    "elasticsearch": "~1.5.6"
  }
}
{% endhighlight %}

<br>
Let's display the percentage of push events by language, for popular repositories, whose commit message contains either the word *merge* or *merged*. Create a module named *esclient.js* within a *lib* directory inside your project root. This is where we'll connect to the local ES node and run queries on the index. It will export a simple function named *runFilteredQuery* which executes a filtered query based on the given parameters.   

<h6>lib/esclient.js</h6>
{% highlight JavaScript %}
"use strict";

var es = require('elasticsearch');
var client = new es.Client();
var index = 'github';
var type = '2014-02-02-14'; 

module.exports.runFilteredQuery = function(query, filter, size, from, callback) {

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
{% endhighlight %}

<br>
With `new es.Client()` you connect to `localhost:9200` with the default settings and receive a client interface which contains a `search()` function for executing queries. Note that the *body* property contains the same structure for the query which we've already posted in previous examples - which is a *query* object that wraps a *filtered* object containing the query and the filter. The size and from parameters are passed as separate properties along with the defined index and type.   

Create another module named *ghevents.js* which will use the *esclient* module to execute given queries with pre-defined filters. Let's define a filter named *stargazedPushesFilter* for push events associated with repositories which have a stargazer count of at least 500.   

<h6>lib/ghevents.js</h6>
{% highlight JavaScript %}
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
{% endhighlight %}

<br>
We define the default number of hits to return as 100 and create an [`and`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-and-filter.html), with caching enabled, for a [`range`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-range-query.html) filter and a [`term`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-term-query.html) filter.   

Next, we export a function named *languageStats* which accepts a search context and runs a filtered query using the *esclient* module.   

<h6>lib/ghevents.js</h6>
{% highlight JavaScript %}
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

module.exports.languageStats = function(search) {

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
{% endhighlight %}

<br>
The search context contains the query, along with callbacks to handle success and failure scenarios, and optional *size* and *from* parameters. If the query executed successfully, all the hits are grouped by the major language for the repository, else the error is forwarded.   

Next we define a route named `analytics.js` inside the *routes* folder which initiates the search and handles the result or failure.   

<h6>routes/analytics.js</h6>
{% highlight JavaScript %}
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
          'Oops!':[1]
        });
      }
  });
};
{% endhighlight %}

<br>
The exported *languages* function looks for all request parameters named *q* and uses them in a [`match`](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-match-query.html) query on the event payload. If the query executed successfully we respond with the result. Else we respond with a *single language named Oops with a count of 1*, to notify the failure without any extra effort.   

Once we've created the route, we can define it in `app.js`, start the express server and make sure that a [request to the route](http://localhost:3000/analytics/languages?q=merge&q=merged) responds with the data.   


<h6>app.js</h6>
{% highlight JavaScript %}
var express = require('express');
var routes = require('./routes');
var analytics = require('./routes/analytics');

...

app.get('/', routes.index);
app.get('/analytics/languages', analytics.languages);

...
{% endhighlight %}

<br>
<pre class="terminal">
<c>node</c> app
<c>curl</c> -XGET localhost:3000/analytics/languages?q=merge&q=merged
</pre>

<br>
To visualize this data, we use a donut chart created by [morris.js](http://www.oesmith.co.uk/morris.js/index.html). The first step is to add morris.js and it's dependencies to the `layout.jade` template.   

<h6>views/layout.jade</h6>
{% highlight CSS %}
doctype html
html
  head
    title= title
    link(rel='stylesheet', href='http://cdn.oesmith.co.uk/morris-0.4.3.min.css')
    link(rel='stylesheet', href='/stylesheets/style.css')
    script(src='http://ajax.googleapis.com/ajax/libs/jquery/1.9.0/jquery.min.js')
    script(src='http://cdnjs.cloudflare.com/ajax/libs/raphael/2.1.0/raphael-min.js')
    script(src='http://cdn.oesmith.co.uk/morris-0.4.3.min.js')
  body
    block content
{% endhighlight %}

<br>
We will also need to make a minor edit on `index.jade` to provide a container for the chart.   

<h6>views/index.jade</h6>
{% highlight CSS %}
extends layout

block content
  h4= title
  div#chart
{% endhighlight %}

<br>
Next, we create our frontend in a file named `chart.js` which invokes a request to our route and fetches the data. The arguments to the match query are sent in the query string. We'll be making use of jQuery since it was already added as a morris.js dependency.   

<h6>public/javascripts/chart.js</h6>
{% highlight JavaScript %}
$(document).ready(function() {
  $.getJSON('/analytics/languages?q=merge&q=merged', function(languages) {
      var data = [];
      var colors = [];
      
      for(var lang in languages) {
        if(languages.hasOwnProperty(lang)) {
          data.push({
            label: lang, 
            value: languages[lang].length
          });
          colors.push('#'+(Math.random().toString(16)).slice(2, 8));
        }
      }

      Morris.Donut({
        element: 'chart',
        data: data,
        colors: colors
      });
  });
});
{% endhighlight %}

<br>
For every hit in the result, we create an array of language names and colors. These are fed to a morris.js donut chart which identifies the id of the container in `index.jade`. We can add this to `layout.jade` and run the application to [visualize the data](http://localhost:3000).   

<h6>views/layout.jade</h6>
{% highlight CSS %}
doctype html
html
  head
    title= title
    link(rel='stylesheet', href='http://cdn.oesmith.co.uk/morris-0.4.3.min.css')
    link(rel='stylesheet', href='/stylesheets/style.css')
    script(src='http://ajax.googleapis.com/ajax/libs/jquery/1.9.0/jquery.min.js')
    script(src='http://cdnjs.cloudflare.com/ajax/libs/raphael/2.1.0/raphael-min.js')
    script(src='http://cdn.oesmith.co.uk/morris-0.4.3.min.js')
    script(src='/javascripts/chart.js')
  body
    block content
{% endhighlight %}

<br>
If you're tired of seeing *"express"* everywhere, make a slight edit to the index route and alter the title.   

<h6>routes/index.js</h6>
{% highlight JavaScript %}
exports.index = function(req, res){
  res.render('index', { title: 'ElasticNode' });
};
{% endhighlight %}

<br>
<pre class="terminal">
<c>node</c> app
</pre>

<br>
![Visualizing ES Results](/images/elasticnode.png "Visualizing ES Results")

